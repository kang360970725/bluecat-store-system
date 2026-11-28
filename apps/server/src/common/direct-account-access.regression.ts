import assert from 'node:assert/strict';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { CurrentUser } from '@bluecat/shared';
import type { PrismaService } from '../database/prisma.service';
import { resolveScopedPermission } from './scoped-permission';
import { isLiveSuperAdmin } from './live-super-admin';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuthService } from '../modules/auth/auth.service';
import { V2AttendanceService } from '../modules/v2-attendance/v2-attendance.service';

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
  const employeeNo = 'BC-2026-001';
  const realAccount = { id: 'test-account', employeeId: 'test-employee', username: account.username,
    employee: { name: '正式员工', phone: account.username, employeeNo } };
  let targetLookups = 0;
  let operatorEnabled = true;
  const testDb = {
    user: {
      findFirst: async (query: Parameters<PrismaService['user']['findFirst']>[0]) =>
        operatorEnabled ? terminalAdminDb.user.findFirst(query) : null
    },
    v2AuthorizationAudit: { create: async ({ data }: { data: { subject: string; actorId: string } }) => {
      assert.equal(data.subject, 'EMPLOYEE_TEST_SESSION');
      assert.equal(data.actorId, 'legacy-admin');
    } },
    v2Store: { findUniqueOrThrow: async () => ({ name: '中海国际店' }) },
    v2EmployeeTestAccess: {
      findUnique: async () => testPolicy,
      updateMany: async ({ data }: { data: Partial<typeof testPolicy> }) => {
        if (!testPolicy.enabled) return { count: 0 };
        Object.assign(testPolicy, data);
        testPolicy.updatedAt = new Date(testPolicy.updatedAt.getTime() + 1);
        return { count: 1 };
      }
    },
    v2Account: {
      ...terminalAdminDb.v2Account,
      findMany: async ({ where }: { where: { AND: { username?: string; employee?: { employeeNo: string } } } }) => {
        targetLookups++;
        return where.AND.username === realAccount.username ||
          where.AND.employee?.employeeNo === employeeNo ? [{ id: realAccount.id }] : [];
      },
      findFirst: async ({ where }: {
        where: { id: string; dataScope: string; employee: { employments: { none: { storeId: { not: string } } } } };
      }) => {
        assert.equal(where.dataScope, 'EMPLOYEE_STORE');
        assert.equal(where.employee.employments.none.storeId.not, 'zhonghai');
        return where.id === realAccount.id ? realAccount : null;
      }
    }
  } as unknown as PrismaService;
  const config = new ConfigService({ jwt: { secret: 'fixture', refreshSecret: 'preview-fixture' } });
  const jwt = new JwtService();
  const auth = new AuthService(jwt, config, testDb);
  const attendance = new V2AttendanceService(testDb, config, auth);
  await assert.rejects(attendance.previewEmployeeTestAccount(employeeNo, 'ordinary-employee'), /无测试权限/);
  assert.equal(targetLookups, 0);
  const operatorId = 'legacy-admin';
  const preview = await attendance.previewEmployeeTestAccount(employeeNo, operatorId);
  assert.equal(preview.name, realAccount.employee.name);
  assert.equal(preview.storeName, '中海国际店');
  assert.equal((await attendance.previewEmployeeTestAccount(realAccount.username, operatorId)).name, preview.name);
  await assert.rejects(attendance.previewEmployeeTestAccount('TEST-UNLISTED', operatorId), /该账号未获准/);
  await assert.rejects(auth.confirmEmployeeTestPreview(preview.ticket, 'another-admin'), /预览已失效/);
  const session = await attendance.confirmEmployeeTestPreview(preview.ticket, operatorId);
  assert.equal(session.user.id, realAccount.id);
  assert.equal(session.refreshToken, '');
  const testStrategy = new JwtStrategy(config, testDb);
  const testSessionRequest = { method: 'GET', originalUrl: '/api/auth/me' };
  const testToken = await jwt.verifyAsync<Parameters<JwtStrategy['validate']>[1]>(session.accessToken, { secret: 'fixture' });
  const testUser = await testStrategy.validate(testSessionRequest, testToken);
  assert.equal(testUser.employeeId, 'test-employee');
  assert.deepEqual(testUser.accessibleStoreIds, ['zhonghai']);
  assert.deepEqual(testUser.permissions, []);
  assert.equal(testUser.username, employeeNo);
  await assert.rejects(testStrategy.validate(testSessionRequest, { ...testToken, sub: 'regular-employee' }), /授权已失效/);
  for (const route of [
    { method: 'POST', originalUrl: '/api/auth/switch-store' },
    { method: 'POST', originalUrl: '/api/v2/attendance/wechat/wifi-punch' },
    { method: 'POST', originalUrl: '/api/v2/attendance/wechat/test-preview' },
    { method: 'POST', originalUrl: '/api/v2/operational-tasks/dispatch' }
  ]) await assert.rejects(testStrategy.validate(route, testToken), /仅能使用/);
  for (const route of [
    { method: 'GET', originalUrl: '/api/v2/operational-tasks/inbox' },
    { method: 'POST', originalUrl: '/api/v2/operational-tasks/production-task/submit' }
  ]) assert.equal((await testStrategy.validate(route, testToken)).id, realAccount.id);
  await assert.rejects(auth.confirmEmployeeTestPreview('invalid-ticket', operatorId), /预览已失效/);
  operatorEnabled = false;
  await assert.rejects(testStrategy.validate(testSessionRequest, testToken), /授权已失效/);
  await assert.rejects(auth.confirmEmployeeTestPreview(preview.ticket, operatorId), /测试账号不可用/);
  operatorEnabled = true;
  await attendance.setEmployeeTestEnabled('legacy-admin', false);
  await assert.rejects(testStrategy.validate(testSessionRequest, testToken), /授权已失效/);
  await assert.rejects(auth.confirmEmployeeTestPreview(preview.ticket, operatorId), /测试账号不可用/);
  await assert.rejects(attendance.previewEmployeeTestAccount(employeeNo, operatorId), /测试模式未开启/);
  testPolicy.enabled = true;
  await assert.rejects(testStrategy.validate(testSessionRequest, testToken), /授权已失效/);
  await assert.rejects(auth.confirmEmployeeTestPreview(preview.ticket, operatorId), /测试账号不可用/);
  console.log('Explicit account role regression checks passed');
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
