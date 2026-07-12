import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { CurrentUser } from '@bluecat/shared';

type JwtPayload = CurrentUser & {
  sub: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('jwt.secret')
    });
  }

  validate(payload: JwtPayload): CurrentUser {
    return {
      id: payload.sub,
      username: payload.username,
      nickname: payload.nickname,
      orgId: payload.orgId,
      storeId: payload.storeId,
      employeeId: payload.employeeId ?? null,
      positionId: payload.positionId ?? null,
      accessibleStoreIds: payload.accessibleStoreIds ?? [],
      roles: payload.roles ?? [],
      permissions: payload.permissions ?? []
    };
  }
}
