import type { Prisma } from '@prisma/client';

const employeeTestAccount = { status: 'ACTIVE', deletedAt: null } as const;
export const employeeTestNumberPrefix = 'TEST-';
export const employeeTestStoreName = '中海国际';

const nowInChina = () =>
  new Date(new Date(Date.now() + 28_800_000).toISOString().slice(0, 10));

export function testTargetScope(storeId: string): Prisma.V2AccountWhereInput {
  const current = { endedOn: null, deletedAt: null, startedOn: { lte: nowInChina() } };
  return {
    ...employeeTestAccount,
    dataScope: 'EMPLOYEE_STORE',
    roles: { none: { role: { code: 'super_admin', enabled: true, deletedAt: null } } },
    employee: {
      status: 'ACTIVE',
      deletedAt: null,
      OR: [
        { employments: { some: { ...current, storeId, store: { status: 'OPERATING', deletedAt: null } } } },
        { organizationEmployments: {
          some: { ...current, costStoreId: storeId, costStore: { status: 'OPERATING', deletedAt: null } }
        } }
      ],
      employments: {
        none: { ...current, storeId: { not: storeId } }
      },
      organizationEmployments: {
        none: { ...current, OR: [{ costStoreId: null }, { costStoreId: { not: storeId } }] }
      }
    }
  };
}

export const employeeTestOperatorScope = {
  ...employeeTestAccount,
  mustChangePassword: false,
  employee: employeeTestAccount
} satisfies Prisma.V2AccountWhereInput;

export async function activeEmployeeTestAccess(db: Prisma.TransactionClient, operatorId: string) {
  const config = await db.v2EmployeeTestAccess.findUnique({ where: { id: 1 } });
  if (!config?.enabled || config.operatorAccountId !== operatorId) return null;
  const operator = await db.v2Account.findFirst({
    where: { id: operatorId, ...employeeTestOperatorScope },
    select: { id: true }
  });
  return operator ? config : null;
}

export async function activeTestTarget(
  db: Prisma.TransactionClient,
  targetId: string,
  operatorId: string
) {
  const config = await activeEmployeeTestAccess(db, operatorId);
  if (!config) return null;
  const target = await db.v2Account.findFirst({
    where: { id: targetId, ...testTargetScope(config.storeId) },
    select: { id: true, username: true, employeeId: true, employee: { select: { name: true, phone: true, employeeNo: true } } }
  });
  if (!target?.employeeId || target.employee?.phone !== target.username) return null;
  return {
    id: target.id, employeeNo: target.employee.employeeNo, name: target.employee.name,
    employeeId: target.employeeId, storeId: config.storeId,
    policyVersion: config.updatedAt.toISOString()
  };
}

export function employeeTestRouteAllowed(method: string, pathname: string) {
  if (method === 'GET' && pathname === '/api/auth/me') return true;
  const tasks = '/api/v2/operational-tasks';
  if (method === 'GET') {
    return pathname === tasks || pathname === tasks + '/inbox' ||
      new RegExp('^' + tasks + '/[^/]+/(assigned-detail|references/[0-2]|evidence/[^/]+)$').test(pathname);
  }
  return method === 'POST' &&
    new RegExp('^' + tasks + '/([^/]+/(submit|evidence-drafts)|inbox/[^/]+/read)$').test(pathname);
}
