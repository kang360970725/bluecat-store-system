import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import type { CurrentUser, LoginResult } from '@bluecat/shared';
import { PrismaService } from '../../database/prisma.service';
import { ChangePasswordDto, LoginDto } from './dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  async login(
    dto: LoginDto,
    context: { ipAddress?: string; userAgent?: string } = {}
  ): Promise<LoginResult> {
    const user = await this.prisma.user.findFirst({
      where: {
        username: dto.username,
        deletedAt: null
      },
      include: {
        employee: {
          include: {
            managedStores: {
              where: { deletedAt: null },
              select: { id: true }
            },
            responsibleStores: {
              where: { deletedAt: null },
              select: { id: true }
            },
            positionRef: {
              include: {
                permissions: {
                  include: {
                    permission: true
                  }
                }
              }
            }
          }
        },
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!user) {
      return this.loginV2(dto, context);
    }
    if (!user.enabled) {
      throw new UnauthorizedException('账号或密码错误');
    }

    const passwordMatched = await compare(dto.password, user.passwordHash);
    if (!passwordMatched) {
      throw new UnauthorizedException('账号或密码错误');
    }

    const rolePermissions = user.roles.flatMap(({ role }) =>
      role.permissions.map(({ permission }) => permission.code)
    );
    const positionPermissions =
      user.employee?.positionRef?.permissions.map(
        ({ permission }) => permission.code
      ) ?? [];
    const accessibleStoreIds = Array.from(
      new Set(
        [
          user.storeId,
          user.employee?.storeId,
          ...(user.employee?.managedStores.map((store) => store.id) ?? []),
          ...(user.employee?.responsibleStores.map((store) => store.id) ?? [])
        ].filter(Boolean) as string[]
      )
    );

    const currentUser: CurrentUser = {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      orgId: user.orgId,
      storeId: user.storeId,
      employeeId: user.employee?.id ?? null,
      positionId: user.employee?.positionId ?? null,
      accessibleStoreIds,
      roles: user.roles.map(({ role }) => role.code),
      permissions: Array.from(
        new Set([...rolePermissions, ...positionPermissions])
      )
    };

    await this.recordLogin(
      'LEGACY_USER',
      user.id,
      user.username,
      user.nickname,
      context
    );
    return this.signSession(currentUser);
  }

  private async loginV2(
    dto: LoginDto,
    context: { ipAddress?: string; userAgent?: string }
  ): Promise<LoginResult> {
    const account = await this.prisma.v2Account.findFirst({
      where: { username: dto.username, status: 'ACTIVE', deletedAt: null },
      include: {
        employee: {
          include: {
            employments: {
              where: { endedOn: null, deletedAt: null },
              include: {
                store: true,
                position: {
                  include: {
                    template: {
                      include: {
                        role: {
                          include: {
                            permissions: { include: { permission: true } }
                          }
                        }
                      }
                    }
                  }
                }
              },
              orderBy: [{ isPrimary: 'desc' }, { startedOn: 'asc' }]
            },
            organizationEmployments: {
              where: { endedOn: null, deletedAt: null },
              include: {
                organization: true,
                costStore: true,
                position: {
                  include: {
                    role: {
                      include: {
                        permissions: { include: { permission: true } }
                      }
                    }
                  }
                }
              },
              orderBy: [{ isPrimary: 'desc' }, { startedOn: 'asc' }]
            }
          }
        },
        roles: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } }
            }
          }
        },
        storeScopes: true
      }
    });
    if (!account || !(await compare(dto.password, account.passwordHash))) {
      throw new UnauthorizedException('账号或密码错误');
    }
    const employment = account.employee?.employments[0];
    const organizationEmployment = account.employee?.organizationEmployments[0];
    const accountRoles = account.roles
      .filter((item) => item.role.enabled && !item.role.deletedAt)
      .map((item) => item.role);
    const positionRoles = [
      ...(account.employee?.employments
        .map((item) => item.position.template?.role)
        .filter(Boolean) ?? []),
      ...(account.employee?.organizationEmployments
        .map((item) => item.position.role)
        .filter(Boolean) ?? [])
    ];
    const effectiveRoles = account.employee
      ? [
          ...accountRoles.filter((role) => role.code === 'super_admin'),
          ...positionRoles.filter(role => role?.enabled && !role.deletedAt && role.code !== 'super_admin')
        ]
      : accountRoles;
    const uniqueRoles = [
      ...new Map(effectiveRoles.map((role) => [role!.id, role!])).values()
    ];
    const roleCodes = uniqueRoles.map((role) => role.code);
    const permissions = uniqueRoles.flatMap((role) =>
      role.permissions.map((link) => link.permission.code)
    );
    const accessibleStoreIds =
      account.dataScope === 'ALL_STORES'
        ? (
            await this.prisma.v2Store.findMany({
              where: { deletedAt: null },
              select: { id: true }
            })
          ).map((item) => item.id)
        : account.dataScope === 'ASSIGNED_STORES'
          ? account.storeScopes.map((item) => item.storeId)
          : Array.from(
              new Set([
                ...(account.employee?.employments.map((item) => item.storeId) ??
                  []),
                ...(account.employee?.organizationEmployments
                  .map((item) => item.costStoreId)
                  .filter(Boolean) as string[])
              ])
            );
    const currentUser: CurrentUser = {
      id: account.id,
      username: account.username,
      nickname: account.displayName,
      orgId:
        employment?.store.organizationId ??
        organizationEmployment?.organizationId ??
        null,
      storeId:
        employment?.storeId ?? organizationEmployment?.costStoreId ?? null,
      employeeId: account.employeeId ?? null,
      positionId:
        employment?.positionId ?? organizationEmployment?.positionId ?? null,
      accessibleStoreIds,
      roles: roleCodes,
      permissions: Array.from(new Set(permissions)),
      mustChangePassword: account.mustChangePassword
    };
    const loggedInAt = new Date();
    await this.prisma.$transaction([
      this.prisma.v2Account.update({
        where: { id: account.id },
        data: { lastLoginAt: loggedInAt }
      }),
      this.prisma.loginLog.create({
        data: {
          accountType: 'V2_ACCOUNT',
          accountId: account.id,
          username: account.username,
          displayName: account.displayName,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          loggedInAt
        }
      })
    ]);
    return this.signSession(currentUser);
  }

  private recordLogin(
    accountType: string,
    accountId: string,
    username: string,
    displayName: string,
    context: { ipAddress?: string; userAgent?: string }
  ) {
    return this.prisma.loginLog.create({
      data: {
        accountType,
        accountId,
        username,
        displayName,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
      }
    });
  }

  async switchStore(user: CurrentUser, storeId: string): Promise<LoginResult> {
    if (!user.accessibleStoreIds.includes(storeId))
      throw new UnauthorizedException('无权切换到该门店');
    const employment = user.employeeId
      ? await this.prisma.v2Employment.findFirst({
          where: {
            employeeId: user.employeeId,
            storeId,
            endedOn: null,
            deletedAt: null
          }
        })
      : null;
    return this.signSession({
      ...user,
      storeId,
      positionId: employment?.positionId ?? null
    });
  }

  async changePassword(user: CurrentUser, dto: ChangePasswordDto) {
    const account = await this.prisma.v2Account.findFirst({
      where: { id: user.id, status: 'ACTIVE', deletedAt: null }
    });
    if (!account || !(await compare(dto.currentPassword, account.passwordHash)))
      throw new UnauthorizedException('当前密码错误');
    if (dto.newPassword === dto.currentPassword)
      throw new UnauthorizedException('新密码不能与初始密码相同');
    await this.prisma.v2Account.update({
      where: { id: account.id },
      data: {
        passwordHash: await hash(dto.newPassword, 12),
        mustChangePassword: false
      }
    });
    return this.signSession({ ...user, mustChangePassword: false });
  }

  private async signSession(currentUser: CurrentUser): Promise<LoginResult> {
    const payload = { sub: currentUser.id, ...currentUser };
    const accessOptions: JwtSignOptions = {
      secret: this.config.getOrThrow<string>('jwt.secret'),
      expiresIn: this.config.getOrThrow('jwt.expiresIn')
    };
    const refreshOptions: JwtSignOptions = {
      secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
      expiresIn: this.config.getOrThrow('jwt.refreshExpiresIn')
    };

    const accessToken = await this.jwtService.signAsync(payload, accessOptions);
    const refreshToken = await this.jwtService.signAsync(
      payload,
      refreshOptions
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: 7200,
      user: currentUser
    };
  }
}
