import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import type { CurrentUser, LoginResult } from '@bluecat/shared';
import { readDirectAccountAccess, resolveAccountStoreIds } from '../../common/direct-account-access';
import { PrismaService } from '../../database/prisma.service';
import { ChangePasswordDto, LoginDto } from './dto';
import { activeTestTarget, testDeviceDigest } from '../../common/employee-test-access';

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

  openWechatSession(accountId: string, wechatBoundAt: string) {
    return this.loginV2({ accountId, wechatBoundAt }, {});
  }

  private async openEmployeeTestSession(accountId: string, expectedPolicyVersion: string, deviceDigest: string): Promise<LoginResult> {
    const target = await activeTestTarget(this.prisma, accountId, deviceDigest);
    if (!target || expectedPolicyVersion !== target.policyVersion)
      throw new UnauthorizedException('测试账号不可用，请重新查询');
    const user: CurrentUser = {
      id: target.id, username: target.employeeNo, nickname: target.name,
      employeeId: target.employeeId, storeId: target.storeId, orgId: null, positionId: null,
      accessibleStoreIds: [target.storeId], roles: [], permissions: [], employeeTestSession: true
    };
    const accessToken = await this.jwtService.signAsync(
      { ...user, sub: user.id, employeeTestPolicyVersion: target.policyVersion, employeeTestDeviceDigest: deviceDigest },
      { secret: this.config.getOrThrow<string>('jwt.secret'), expiresIn: '30m' }
    );
    await this.prisma.loginLog.create({
      data: { accountType: 'V2_EMPLOYEE_TEST', accountId: user.id, username: user.username, displayName: user.nickname }
    });
    return { accessToken, refreshToken: '', expiresIn: 1800, user };
  }

  createEmployeeTestPreviewTicket(accountId: string, policyVersion: string, deviceDigest: string) {
    return this.jwtService.signAsync(
      { sub: accountId, policyVersion, deviceDigest },
      {
        secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
        audience: 'employee-test-preview',
        expiresIn: '2m'
      }
    );
  }

  async confirmEmployeeTestPreview(ticket: string, deviceToken: string): Promise<LoginResult> {
    let preview: { sub: string; policyVersion: string; deviceDigest: string };
    try {
      preview = await this.jwtService.verifyAsync(ticket, {
        secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
        audience: 'employee-test-preview'
      });
    } catch {
      throw new UnauthorizedException('预览已失效，请重新查询测试账号');
    }
    const digest = testDeviceDigest(deviceToken);
    if (typeof preview.sub !== 'string' || typeof preview.policyVersion !== 'string' || preview.deviceDigest !== digest)
      throw new UnauthorizedException('预览已失效，请重新查询测试账号');
    return this.openEmployeeTestSession(preview.sub, preview.policyVersion, digest);
  }

  private async loginV2(
    dto: LoginDto | { accountId: string; wechatBoundAt: string },
    context: { ipAddress?: string; userAgent?: string }
  ): Promise<LoginResult> {
    const today = new Date(new Date(Date.now() + 28_800_000).toISOString().slice(0, 10));
    const account = await this.prisma.v2Account.findFirst({
      where: {
        ...('accountId' in dto
          ? { id: dto.accountId, employeeId: { not: null }, mustChangePassword: false,
              attendanceWechatBinding: { createdAt: new Date(dto.wechatBoundAt) } }
          : { username: dto.username }),
        status: 'ACTIVE', deletedAt: null
      },
      include: {
        employee: {
          include: {
            employments: {
              where: { endedOn: null, deletedAt: null, startedOn: { lte: today } },
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
              where: { endedOn: null, deletedAt: null, startedOn: { lte: today } },
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
    if (
      !account ||
      ('password' in dto && !(await compare(dto.password, account.passwordHash))) ||
      (account.employeeId &&
        (!account.employee || account.employee.deletedAt || account.employee.status !== 'ACTIVE' ||
          !/^1[3-9]\d{9}$/.test(account.username) || account.employee.phone !== account.username))
    ) {
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
    const effectiveRoles = account.employee && !account.usesAccountRoles
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
    const accessibleStoreIds = resolveAccountStoreIds(account, roleCodes) ?? (
      await this.prisma.v2Store.findMany({
        where: { deletedAt: null, status: { not: 'CLOSED' } },
        select: { id: true }
      })
    ).map(({ id }) => id);
    const primaryStoreId = employment?.storeId ?? organizationEmployment?.costStoreId ?? null;
    const currentUser: CurrentUser = {
      id: account.id,
      username: account.username,
      nickname: account.displayName,
      orgId:
        employment?.store.organizationId ??
        organizationEmployment?.organizationId ??
        null,
      storeId: primaryStoreId && accessibleStoreIds.includes(primaryStoreId)
        ? primaryStoreId
        : accessibleStoreIds[0] ?? null,
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
    return this.signSession({ ...currentUser, wechatBoundAt: 'wechatBoundAt' in dto ? dto.wechatBoundAt : undefined });
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
    const direct = await readDirectAccountAccess(this.prisma, account.id);
    return this.signSession({
      ...user,
      ...(direct?.active && !('inherited' in direct) ? { roles: direct.roles, permissions: direct.permissions } : {}),
      mustChangePassword: false
    });
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
