import type { Prisma, V2DataScopeType } from '@prisma/client';

export function resolveAccountStoreIds(account: {
  employeeId: string | null;
  dataScope: V2DataScopeType;
  storeScopes: { storeId: string }[];
  employee?: {
    employments: { storeId: string }[];
    organizationEmployments: { costStoreId: string | null }[];
  } | null;
}, roles: string[]): string[] | null {
  if (roles.includes('super_admin') || (!account.employeeId && account.dataScope === 'ALL_STORES'))
    return null;
  if (account.dataScope === 'ASSIGNED_STORES')
    return [...new Set(account.storeScopes.map(({ storeId }) => storeId))];
  return [...new Set([
    ...(account.employee?.employments.map(({ storeId }) => storeId) ?? []),
    ...(account.employee?.organizationEmployments.flatMap(({ costStoreId }) =>
      costStoreId ? [costStoreId] : []
    ) ?? [])
  ])];
}

export async function readDirectAccountAccess(
  db: Prisma.TransactionClient,
  id: string
) {
  const today = new Date(new Date(Date.now() + 28_800_000).toISOString().slice(0, 10));
  const current = { deletedAt: null, endedOn: null, startedOn: { lte: today } };
  const account = await db.v2Account.findFirst({
    where: { id },
    select: {
      username: true,
      usesAccountRoles: true,
      status: true,
      deletedAt: true,
      employeeId: true,
      mustChangePassword: true,
      dataScope: true,
      storeScopes: { select: { storeId: true } },
      roles: {
        where: { role: { enabled: true, deletedAt: null } },
        select: {
          role: {
            select: {
              code: true,
              permissions: { select: { permission: { select: { code: true } } } }
            }
          }
        }
      },
      employee: {
        select: {
          phone: true,
          status: true,
          deletedAt: true,
          employments: { where: current, select: { storeId: true } },
          organizationEmployments: { where: current, select: { costStoreId: true } }
        }
      }
    }
  });
  if (!account) return null;
  if (
    account.status !== 'ACTIVE' ||
    account.deletedAt ||
    (account.employeeId &&
      (!account.employee || account.employee.deletedAt || account.employee.status !== 'ACTIVE' || account.employee.phone !== account.username || !/^1[3-9]\d{9}$/.test(account.username)))
  ) return { active: false } as const;

  const roles = account.roles.map(({ role }) => role.code);
  const storeIds = resolveAccountStoreIds(account, roles);
  if (!account.usesAccountRoles)
    return { active: true, inherited: true, username: account.username, storeIds } as const;

  const permissions = [
    ...new Set(account.roles.flatMap(({ role }) =>
      role.permissions.map(({ permission }) => permission.code)
    ))
  ];
  return {
    active: true,
    username: account.username,
    employeeId: account.employeeId,
    mustChangePassword: account.mustChangePassword,
    roles,
    permissions,
    storeIds
  } as const;
}
