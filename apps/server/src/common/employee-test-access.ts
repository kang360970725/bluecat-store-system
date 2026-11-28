import type { Prisma } from '@prisma/client';
import { resolveScopedPermission } from './scoped-permission';

const employeeTestAccount = { status: 'ACTIVE', deletedAt: null } as const;
export const employeeTestNumberPrefix = 'TEST-';
export const employeeTestStoreName = '中海国际';

const nowInChina = () =>
  new Date(new Date(Date.now() + 28_800_000).toISOString().slice(0, 10));

export function testTargetScope(storeId: string): Prisma.V2AccountWhereInput {
  const current = { endedOn: null, deletedAt: null, startedOn: { lte: nowInChina() } };
  return {
    ...employeeTestAccount,
    mustChangePassword: false,
    dataScope: 'EMPLOYEE_STORE',
    roles: { none: { role: { code: 'super_admin', enabled: true, deletedAt: null } } },
    employee: {
      status: 'ACTIVE',
      deletedAt: null,
      employeeNo: { startsWith: employeeTestNumberPrefix },
      employments: {
        some: { ...current, storeId, store: { status: 'OPERATING', deletedAt: null } },
        none: { ...current, storeId: { not: storeId } }
      },
      organizationEmployments: { none: current }
    }
  };
}

export async function employeeTestOperator(db: Prisma.TransactionClient, operatorSubject: string, storeId: string) {
  const binding = await db.v2AttendanceWechatBinding.findFirst({
    where: {
      subject: operatorSubject,
      account: {
        ...employeeTestAccount, mustChangePassword: false,
        employee: { status: 'ACTIVE', deletedAt: null }
      }
    },
    select: { accountId: true }
  });
  if (!binding) return false;
  const access = await resolveScopedPermission(binding.accountId, 'schedule:update', db);
  return Boolean(access && (!access.storeIds || access.storeIds.includes(storeId)));
}

export async function activeTestTarget(
  db: Prisma.TransactionClient,
  targetId: string,
  operatorSubject: string
) {
  const config = await db.v2EmployeeTestAccess.findUnique({ where: { id: 1 } });
  if (!config?.enabled || !(await employeeTestOperator(db, operatorSubject, config.storeId))) return null;
  const target = await db.v2Account.findFirst({
    where: { id: targetId, ...testTargetScope(config.storeId) },
    select: { id: true, username: true, employeeId: true, employee: { select: { name: true, phone: true } } }
  });
  if (!target?.employeeId || target.employee?.phone !== target.username) return null;
  return {
    ...target, employeeId: target.employeeId, storeId: config.storeId,
    policyVersion: config.updatedAt.toISOString()
  };
}

export function employeeTestRouteAllowed(method: string, pathname: string) {
  if (method === 'GET' && pathname === '/api/auth/me') return true;
  if (method === 'POST' && /^\/api\/v2\/attendance\/wechat\/test-(assignments|wifi-punch|corrections)$/.test(pathname))
    return true;
  const base = '/api/v2/operational-tasks';
  if (method === 'GET') {
    return pathname === base || pathname === base + '/inbox' ||
      new RegExp('^' + base + '/[^/]+/(assigned-detail|references/[0-2]|evidence/[^/]+)$').test(pathname);
  }
  return method === 'POST' && new RegExp('^' + base + '/([^/]+/(submit|evidence-drafts)|inbox/[^/]+/read)$').test(pathname);
}
