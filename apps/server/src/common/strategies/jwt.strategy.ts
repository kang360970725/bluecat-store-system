import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { CurrentUser } from '@bluecat/shared';
import { PrismaService } from '../../database/prisma.service';
import { readDirectAccountAccess } from '../direct-account-access';

type JwtPayload = CurrentUser & {
  sub: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('jwt.secret')
    });
  }

  async validate(payload: JwtPayload): Promise<CurrentUser> {
    if (payload.wechatBoundAt && !(await this.prisma.v2AttendanceWechatBinding.findFirst({
      where: { createdAt: new Date(payload.wechatBoundAt), accountId: payload.sub },
      select: { accountId: true }
    }))) throw new UnauthorizedException('微信绑定已失效');
    const account = await readDirectAccountAccess(this.prisma, payload.sub);
    if (account && (!account.active || account.username !== payload.username)) throw new UnauthorizedException('账号已停用');
    if (!account) {
      const legacy = await this.prisma.user.findFirst({
        where: { id: payload.sub, enabled: true, deletedAt: null },
        select: { id: true }
      });
      if (!legacy) throw new UnauthorizedException('账号已停用');
    }
    const direct = account?.active && !('inherited' in account) ? account : null;
    const accessibleStoreIds = account?.active
      ? account.storeIds ?? (await this.prisma.v2Store.findMany({
          where: { deletedAt: null, status: { not: 'CLOSED' } },
          select: { id: true }
        })).map(({ id }) => id)
      : payload.accessibleStoreIds ?? [];
    const storeId = account?.active && !accessibleStoreIds.includes(payload.storeId ?? '')
      ? accessibleStoreIds[0] ?? null
      : payload.storeId;
    return {
      id: payload.sub,
      wechatBoundAt: payload.wechatBoundAt,
      username: payload.username,
      nickname: payload.nickname,
      orgId: payload.orgId,
      storeId,
      employeeId: payload.employeeId ?? null,
      positionId: payload.positionId ?? null,
      accessibleStoreIds,
      roles: direct?.active
        ? direct.mustChangePassword ? [] : direct.roles
        : payload.roles ?? [],
      permissions: direct?.active
        ? direct.mustChangePassword ? [] : direct.permissions
        : payload.permissions ?? [],
      mustChangePassword: direct?.active ? direct.mustChangePassword : payload.mustChangePassword
    };
  }
}
