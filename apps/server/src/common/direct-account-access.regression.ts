import assert from 'node:assert/strict';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { CurrentUser } from '@bluecat/shared';
import type { PrismaService } from '../database/prisma.service';
import { resolveScopedPermission } from './scoped-permission';
import { isLiveSuperAdmin } from './live-super-admin';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuthService } from '../modules/auth/auth.service';

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
  const validate = (payload: Parameters<JwtStrategy['validate']>[1]) =>
    strategy.validate({ method: 'GET', originalUrl: '/api/auth/me' }, payload);
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
  assert.deepEqual((await validate(oldToken)).accessibleStoreIds, ['store-a']);
  assert.deepEqual((await validate(oldToken)).roles, ['manager']);

  const wechatToken = { ...oldToken, wechatBoundAt: '2026-11-15T00:00:00.000Z' };
  assert.equal((await validate(wechatToken)).wechatBoundAt, wechatToken.wechatBoundAt);
  wechatBindingExists = false;
  await assert.rejects(validate(wechatToken), /微信绑定已失效/);

  account.dataScope = 'ALL_STORES';
  account.employee.employments = [];
  account.employee.organizationEmployments = [{ costStoreId: 'managed-store' }];
  assert.deepEqual(await resolveScopedPermission('account', permission, db), {
    employeeId: 'employee',
    storeIds: ['managed-store']
  });
  const restoredSession = await validate({ ...oldToken, storeId: 'store-a' });
  assert.deepEqual(restoredSession.accessibleStoreIds, ['managed-store']);
  assert.equal(restoredSession.storeId, 'managed-store');
  account.usesAccountRoles = false;
  assert.deepEqual((await validate(oldToken)).accessibleStoreIds, ['managed-store']);
  account.usesAccountRoles = true;
  account.employee.organizationEmployments = [];
  assert.deepEqual((await validate(oldToken)).accessibleStoreIds, []);
  assert.equal(await resolveScopedPermission('account', permission, db), null);

  account.username = account.employee.phone = '13800000002';
  await assert.rejects(validate(oldToken), /停用/);
  account.username = account.employee.phone = oldToken.username;

  account.roles = [];
  assert.equal(await resolveScopedPermission('account', permission, db), null);
  assert.deepEqual((await validate(oldToken)).permissions, []);
  account.status = 'DISABLED';
  await assert.rejects(validate(oldToken), /停用/);
  account.usesAccountRoles = false;
  await assert.rejects(validate(oldToken), /停用/);
  account.status = 'ACTIVE';
  assert.deepEqual((await validate(oldToken)).roles, oldToken.roles);
  v2AccountExists = false;
  assert.deepEqual((await validate(oldToken)).roles, oldToken.roles);
  assert.deepEqual(await resolveScopedPermission('account', permission, db), {
    employeeId: null,
    storeIds: null
  });
  legacyEnabled = false;
  assert.equal(await resolveScopedPermission('account', permission, db), null);
  await assert.rejects(validate(oldToken), /停用/);
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
  const testPolicy = {
    enabled: true,
    storeId: 'zhonghai', updatedAt: new Date('2026-11-28T08:00:00Z')
  };
  let operatorStore = 'zhonghai';
  const testDb = {
    v2EmployeeTestAccess: { findUnique: async () => testPolicy },
    v2AttendanceWechatBinding: {
      findFirst: async ({ where }: { where: { subject: string } }) =>
        where.subject === 'authorized-wechat' ? { accountId: 'operator' } : null
    },
    v2Account: {
      findFirst: async ({ where }: { where: { id: string; dataScope: string; employee: { employeeNo: { startsWith: string } } } }) => {
        if (where.id === 'operator') return {
          ...account, status: 'ACTIVE', mustChangePassword: false, usesAccountRoles: true, dataScope: 'ASSIGNED_STORES',
          storeScopes: [{ storeId: operatorStore }],
          roles: [{ role: { code: 'manager', permissions: [{ permission: { code: 'schedule:update' } }] } }]
        };
        assert.equal(where.dataScope, 'EMPLOYEE_STORE');
        assert.equal(where.employee.employeeNo.startsWith, 'TEST-');
        return where.id === 'test-account'
          ? { id: where.id, employeeId: 'test-employee', username: account.username,
              employee: { name: '测试员工', phone: account.username } }
          : null;
      }
    },
    loginLog: { create: async () => ({}) }
  } as unknown as PrismaService;
  const testStrategy = new JwtStrategy(new ConfigService({ jwt: { secret: 'fixture' } }), testDb);
  const inboxRequest = { method: 'GET', originalUrl: '/api/v2/operational-tasks/inbox' };
  const testToken = {
    ...oldToken, sub: 'test-account', employeeTestSession: true,
    employeeTestOperatorSubject: 'authorized-wechat',
    employeeTestPolicyVersion: testPolicy.updatedAt.toISOString()
  };
  const testUser = await testStrategy.validate(inboxRequest, testToken);
  assert.equal(testUser.employeeId, 'test-employee');
  assert.deepEqual(testUser.accessibleStoreIds, ['zhonghai']);
  assert.deepEqual(testUser.permissions, []);
  operatorStore = 'different-store';
  await assert.rejects(testStrategy.validate(inboxRequest, testToken), /授权已失效/);
  operatorStore = 'zhonghai';
  await assert.rejects(testStrategy.validate(inboxRequest, { ...testToken, sub: 'regular-employee' }), /授权已失效/);
  await assert.rejects(testStrategy.validate(inboxRequest, { ...testToken, employeeTestOperatorSubject: 'different-wechat' }), /授权已失效/);
  await assert.rejects(testStrategy.validate({ method: 'POST', originalUrl: '/api/auth/switch-store' }, testToken), /仅能使用/);
  const auth = new AuthService(new JwtService(), new ConfigService({
    jwt: { secret: 'fixture', refreshSecret: 'preview-fixture' }
  }), testDb);
  const ticket = await auth.createEmployeeTestPreviewTicket('test-account', 'authorized-wechat', testPolicy.updatedAt.toISOString());
  assert.equal((await auth.confirmEmployeeTestPreview(ticket)).user.id, 'test-account');
  await assert.rejects(auth.confirmEmployeeTestPreview('invalid-ticket'), /预览已失效/);
  testPolicy.enabled = false;
  await assert.rejects(testStrategy.validate(inboxRequest, testToken), /授权已失效/);
  await assert.rejects(auth.confirmEmployeeTestPreview(ticket), /测试账号不可用/);
  testPolicy.enabled = true;
  testPolicy.updatedAt = new Date('2026-11-28T08:01:00Z');
  await assert.rejects(testStrategy.validate(inboxRequest, testToken), /授权已失效/);
  await assert.rejects(auth.confirmEmployeeTestPreview(ticket), /测试账号不可用/);
  console.log('Explicit account role regression checks passed');
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
