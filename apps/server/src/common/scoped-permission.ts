import type { Prisma } from '@prisma/client';
import { readDirectAccountAccess } from './direct-account-access';
import { isLiveSuperAdmin } from './live-super-admin';

const activeAccount = { status: 'ACTIVE', deletedAt: null } as const;

export async function resolveScopedPermission(
  accountId: string,
  permission: string,
  db: Prisma.TransactionClient
): Promise<{ employeeId: string | null; storeIds: string[] | null } | null> {
  const direct = await readDirectAccountAccess(db, accountId);
  if (direct && !direct.active) return null;
  if (direct?.active && !('inherited' in direct)) {
    if (direct.mustChangePassword) return null;
    if (!direct.roles.includes('super_admin') && !direct.permissions.includes(permission))
      return null;
    if (direct.storeIds?.length === 0) return null;
    return { employeeId: direct.employeeId, storeIds: direct.storeIds };
  }
  if (!direct && (await isLiveSuperAdmin(db, accountId))) {
    return { employeeId: null, storeIds: null };
  }
  const grants: Prisma.V2RoleWhereInput = {
    code: { not: 'super_admin' },
    enabled: true,
    deletedAt: null,
    permissions: { some: { permission: { code: permission } } }
  };
  const today = new Date(
    new Date(Date.now() + 28_800_000).toISOString().slice(0, 10)
  );
  const currentEmployment = {
    deletedAt: null,
    startedOn: { lte: today },
    endedOn: null
  };
  const enabledPosition = { enabled: true, deletedAt: null };
  const account = await db.v2Account.findFirst({
    where: { id: accountId, ...activeAccount, mustChangePassword: false },
    select: {
      employeeId: true,
      dataScope: true,
      roles: {
        where: {
          role: {
            OR: [
              { code: 'super_admin', enabled: true, deletedAt: null },
              grants
            ]
          }
        },
        select: { role: { select: { code: true } } }
      },
      storeScopes: { select: { storeId: true } },
      employee: {
        select: {
          status: true,
          deletedAt: true,
          employments: {
            where: {
              ...currentEmployment,
              position: {
                ...enabledPosition,
                template: { ...enabledPosition, role: grants }
              }
            },
            select: { storeId: true }
          },
          organizationEmployments: {
            where: {
              ...currentEmployment,
              position: { ...enabledPosition, role: grants }
            },
            select: { costStoreId: true }
          }
        }
      }
    }
  });
  if (
    !account ||
    (account.employeeId &&
      (!account.employee ||
        account.employee.status !== 'ACTIVE' ||
        account.employee.deletedAt))
  ) {
    return null;
  }
  const { employeeId, employee, dataScope } = account;
  if (account.roles.some(({ role }) => role.code === 'super_admin')) {
    return { employeeId, storeIds: null };
  }
  const assigned = account.storeScopes.map((scope) => scope.storeId);
  const unrestrictedRole = employee
    ? employee.organizationEmployments.some(
        (employment) => !employment.costStoreId
      )
    : account.roles.length > 0;
  if (!employeeId && unrestrictedRole && dataScope === 'ALL_STORES')
    return { employeeId, storeIds: null };

  const positionStores = [
    ...(employee?.employments.map((employment) => employment.storeId) ?? []),
    ...(employee?.organizationEmployments.flatMap((employment) =>
      employment.costStoreId ? [employment.costStoreId] : []
    ) ?? [])
  ];
  const storeIds = new Set(
    dataScope === 'ASSIGNED_STORES'
      ? positionStores.filter((storeId) => assigned.includes(storeId))
      : positionStores
  );
  if (unrestrictedRole && dataScope === 'ASSIGNED_STORES') {
    for (const storeId of assigned) storeIds.add(storeId);
  }
  if (!storeIds.size) return null;
  return { employeeId, storeIds: [...storeIds] };
}
