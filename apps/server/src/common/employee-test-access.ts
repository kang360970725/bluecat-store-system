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

export async function activeTestTarget(
  db: Prisma.TransactionClient,
  targetId: string
) {
  const config = await db.v2EmployeeTestAccess.findUnique({ where: { id: 1 } });
  if (!config?.enabled) return null;
  const target = await db.v2Account.findFirst({
    where: { id: targetId, ...testTargetScope(config.storeId) },
    select: { id: true, username: true, employeeId: true, employee: { select: { name: true, phone: true, employeeNo: true } } }
  });
  if (!target?.employeeId || target.employee?.phone !== target.username ||
      !target.employee.employeeNo.toUpperCase().startsWith(employeeTestNumberPrefix)) return null;
  return {
    id: target.id, employeeNo: target.employee.employeeNo, name: target.employee.name,
    employeeId: target.employeeId, storeId: config.storeId,
    policyVersion: config.updatedAt.toISOString()
  };
}

export function employeeTestRouteAllowed(method: string, pathname: string) {
  return method === 'GET' && pathname === '/api/auth/me';
}
