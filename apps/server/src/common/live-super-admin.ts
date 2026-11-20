import type { Prisma } from '@prisma/client';

export async function isLiveSuperAdmin(db: Prisma.TransactionClient, id: string) {
  const v2 = await db.v2Account.findUnique({
    where: { id },
    select: {
      status: true, deletedAt: true, mustChangePassword: true,
      employee: { select: { status: true, deletedAt: true } },
      roles: {
        where: { role: { code: 'super_admin', enabled: true, deletedAt: null } },
        select: { roleId: true }
      }
    }
  });
  if (v2) {
    return v2.status === 'ACTIVE' && !v2.deletedAt && !v2.mustChangePassword &&
      (!v2.employee || (v2.employee.status === 'ACTIVE' && !v2.employee.deletedAt)) &&
      v2.roles.length > 0;
  }
  return Boolean(await db.user.findFirst({
    where: { id, enabled: true, deletedAt: null, roles: { some: { role: { code: 'super_admin', deletedAt: null } } } },
    select: { id: true }
  }));
}
