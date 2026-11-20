import assert from 'node:assert/strict';
import { ConfigService } from '@nestjs/config';
import type { CurrentUser } from '@bluecat/shared';
import type { PrismaService } from '../../database/prisma.service';
import { V2OperationsService } from './v2-operations.service';

async function run() {
  const stores = ['own', 'other', 'closed'].map(id => ({
    id, name: id, shortName: null, status: id === 'closed' ? 'CLOSED' : 'OPERATING'
  }));
  const service = new V2OperationsService({
    v2Store: {
      findMany: async ({ where }: { where: { id?: { in: string[] }; status: { not: string } } }) =>
        stores.filter(store => store.status !== where.status.not && (!where.id || where.id.in.includes(store.id)))
    }
  } as unknown as PrismaService, new ConfigService());
  service.storePerformanceRanking = async user => ({
    month: '2026-11', elapsedDays: 10, daysInMonth: 30,
    items: stores.filter(store => !user || user.accessibleStoreIds.includes(store.id)).map(({ id }, index) => ({
      storeId: id, rank: index + 1, monthTotal: 0, estimatedRevenue: 0,
      target: 0, completionRate: 0, estimatedCompletionRate: 0, profitTarget: 0,
      actualProfit: 0, profitCompletionRate: 0, estimatedProfit: 0, estimatedProfitCompletionRate: 0
    }))
  });
  const manager = { roles: ['store_manager'], permissions: ['store:view'], accessibleStoreIds: ['own'] } as CurrentUser;
  const summary = await service.storeCenterRanking(manager);
  assert.deepEqual(summary.items.map(({ id, canOpenWorkspace }) => [id, canOpenWorkspace]), [
    ['own', true], ['other', false]
  ]);
  assert.equal(summary.summaryScope, 'managed');
  assert.deepEqual(summary.summaryStoreIds, ['own']);
  const admin = await service.storeCenterRanking({ ...manager, roles: ['super_admin'], accessibleStoreIds: [] });
  assert.equal(admin.summaryScope, 'all');
  assert.deepEqual(admin.summaryStoreIds, ['own', 'other']);
  const scoped = await service.storeCenterRanking({ ...manager, roles: [], permissions: ['performance:view'] });
  assert.deepEqual(scoped.items.map(({ id, canOpenWorkspace }) => [id, canOpenWorkspace]), [['own', false]]);
  assert.equal(scoped.summaryScope, 'authorized');
  assert.deepEqual(scoped.summaryStoreIds, ['own']);
  await assert.rejects(service.storeCenterRanking({ ...manager, roles: [] }), /无权/);
  await assert.rejects(service.storeCenterRanking({ ...manager, mustChangePassword: true }), /无权/);
  console.log('Store Center ranking permission regression checks passed');
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
