import assert from 'node:assert/strict';
import { ConfigService } from '@nestjs/config';
import type { CurrentUser } from '@bluecat/shared';
import type { PrismaService } from '../database/prisma.service';
import { resolveScopedPermission } from './scoped-permission';
import { isLiveSuperAdmin } from './live-super-admin';
import { JwtStrategy } from './strategies/jwt.strategy';

const permission = 'operational-task:manage';
const account = {
  username: '13800000001',
  usesAccountRoles: true,
  status: 'ACTIVE',
  deletedAt: null,
  mustChangePassword: false,
  employeeId: 'employee',
  dataScope: 'ASSIGNED_STORES',
  storeScopes: [{ storeId: 'store-a' }],
  roles: [{ role: { code: 'manager', permissions: [{ permission: { code: permission } }] } }],
  employee: {
    phone: '13800000001',
    status: 'ACTIVE',
    deletedAt: null,
    employments: [{ storeId: 'store-b' }],
    organizationEmployments: [] as { costStoreId: string }[]
  }
};
let v2AccountExists = true;
let legacyEnabled = true;
let wechatBindingExists = true;
const db = {
  v2AttendanceWechatBinding: { findFirst: async () => wechatBindingExists ? { accountId: 'account' } : null },
  v2Account: {
    findFirst: async () => v2AccountExists ? account : null,
    findUnique: async () => v2AccountExists ? account : null
  },
  user: { findFirst: async () => legacyEnabled ? { id: 'legacy' } : null }
} as unknown as PrismaService;

async function run() {
  const strategy = new JwtStrategy(new ConfigService({ jwt: { secret: 'fixture' } }), db);
  const oldToken = {
    sub: 'account',
    username: account.username,
    roles: ['position-manager'],
    permissions: [permission],
    accessibleStoreIds: ['store-a', 'store-b']
  } as CurrentUser & { sub: string };

  assert.deepEqual(await resolveScopedPermission('account', permission, db), {
    employeeId: 'employee',
    storeIds: ['store-a']
  });
  assert.deepEqual((await strategy.validate(oldToken)).accessibleStoreIds, ['store-a']);
  assert.deepEqual((await strategy.validate(oldToken)).roles, ['manager']);

  const wechatToken = { ...oldToken, wechatBoundAt: '2026-11-15T00:00:00.000Z' };
  assert.equal((await strategy.validate(wechatToken)).wechatBoundAt, wechatToken.wechatBoundAt);
  wechatBindingExists = false;
  await assert.rejects(strategy.validate(wechatToken), /微信绑定已失效/);

  account.dataScope = 'ALL_STORES';
  account.employee.employments = [];
  account.employee.organizationEmployments = [{ costStoreId: 'managed-store' }];
  assert.deepEqual(await resolveScopedPermission('account', permission, db), {
    employeeId: 'employee',
    storeIds: ['managed-store']
  });
  const restoredSession = await strategy.validate({ ...oldToken, storeId: 'store-a' });
  assert.deepEqual(restoredSession.accessibleStoreIds, ['managed-store']);
  assert.equal(restoredSession.storeId, 'managed-store');
  account.usesAccountRoles = false;
  assert.deepEqual((await strategy.validate(oldToken)).accessibleStoreIds, ['managed-store']);
  account.usesAccountRoles = true;
  account.employee.organizationEmployments = [];
  assert.deepEqual((await strategy.validate(oldToken)).accessibleStoreIds, []);
  assert.equal(await resolveScopedPermission('account', permission, db), null);

  account.username = account.employee.phone = '13800000002';
  await assert.rejects(strategy.validate(oldToken), /停用/);
  account.username = account.employee.phone = oldToken.username;

  account.roles = [];
  assert.equal(await resolveScopedPermission('account', permission, db), null);
  assert.deepEqual((await strategy.validate(oldToken)).permissions, []);
  account.status = 'DISABLED';
  await assert.rejects(strategy.validate(oldToken), /停用/);
  account.usesAccountRoles = false;
  await assert.rejects(strategy.validate(oldToken), /停用/);
  account.status = 'ACTIVE';
  assert.deepEqual((await strategy.validate(oldToken)).roles, oldToken.roles);
  v2AccountExists = false;
  assert.deepEqual((await strategy.validate(oldToken)).roles, oldToken.roles);
  assert.deepEqual(await resolveScopedPermission('account', permission, db), {
    employeeId: null,
    storeIds: null
  });
  legacyEnabled = false;
  assert.equal(await resolveScopedPermission('account', permission, db), null);
  await assert.rejects(strategy.validate(oldToken), /停用/);
  const terminalAdminDb = {
    v2Account: { findUnique: async () => null },
    user: {
      findFirst: async ({ where }: {
        where: { id: string; enabled: boolean; roles: { some: { role: { code: string } } } };
      }) => where.id === 'legacy-admin' && where.enabled &&
        where.roles.some.role.code === 'super_admin' ? { id: where.id } : null
    }
  } as unknown as PrismaService;
  assert.equal(await isLiveSuperAdmin(terminalAdminDb, 'legacy-admin'), true);
  assert.equal(await isLiveSuperAdmin(terminalAdminDb, 'employee'), false);
  console.log('Explicit account role regression checks passed');
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
