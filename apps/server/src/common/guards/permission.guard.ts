import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { CurrentUser } from '@bluecat/shared';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!requiredPermissions?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: CurrentUser }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('缺少用户上下文');
    }

    if (user.roles.includes('super_admin')) {
      return true;
    }

    const scopedRequest = context.switchToHttp().getRequest<{ params?: Record<string, string>; query?: Record<string, string>; body?: Record<string, unknown> }>();
    const requestedStoreId = scopedRequest.params?.storeId || scopedRequest.query?.storeId || (typeof scopedRequest.body?.storeId === 'string' ? scopedRequest.body.storeId : undefined);
    if (requestedStoreId && !user.accessibleStoreIds.includes(requestedStoreId)) {
      throw new ForbiddenException('无权访问该门店数据');
    }

    const ownedPermissions = new Set(user.permissions);
    const allowed = requiredPermissions.every((permission) =>
      ownedPermissions.has(permission)
    );

    if (!allowed) {
      throw new ForbiddenException('权限不足');
    }

    return true;
  }
}
