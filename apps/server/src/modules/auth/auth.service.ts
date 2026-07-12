import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import type { CurrentUser, LoginResult } from '@bluecat/shared';
import { PrismaService } from '../../database/prisma.service';
import { LoginDto } from './dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  async login(dto: LoginDto): Promise<LoginResult> {
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

    if (!user || !user.enabled) {
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
      permissions: Array.from(new Set([...rolePermissions, ...positionPermissions]))
    };

    const payload = {
      sub: currentUser.id,
      ...currentUser
    };

    const accessOptions: JwtSignOptions = {
      secret: this.config.getOrThrow<string>('jwt.secret'),
      expiresIn: this.config.getOrThrow('jwt.expiresIn')
    };
    const refreshOptions: JwtSignOptions = {
      secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
      expiresIn: this.config.getOrThrow('jwt.refreshExpiresIn')
    };

    const accessToken = await this.jwtService.signAsync(payload, accessOptions);
    const refreshToken = await this.jwtService.signAsync(payload, refreshOptions);

    return {
      accessToken,
      refreshToken,
      expiresIn: 7200,
      user: currentUser
    };
  }
}
