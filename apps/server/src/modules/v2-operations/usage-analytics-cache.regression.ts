import assert from 'node:assert/strict';
import type { ConfigService } from '@nestjs/config';
import type { CurrentUser } from '@bluecat/shared';
import type { PrismaService } from '../../database/prisma.service';
import { V2UsageAnalyticsService } from './v2-usage-analytics.service';

async function run() {
  let activeStore = true;
  const prisma = {
    v2Store: {
      findFirst: async () =>
        activeStore
          ? {
              id: 'store',
              code: 'TEST',
              name: '测试门店',
              shortName: null,
              dataSource: { sourceSystem: 'X_MANAGER', externalStoreId: 'test' }
            }
          : null
    }
  } as unknown as PrismaService;
  const config = {
    get: (key: string) =>
      key === 'app.bluecatBridgeBaseUrl'
        ? 'http://bridge.test/bridge/bluecat'
        : 'fixture'
  } as ConfigService;
  const user = { roles: [], accessibleStoreIds: ['store'] } as unknown as CurrentUser;
  const service = new V2UsageAnalyticsService(prisma, config);
  const realFetch = globalThis.fetch;
  const realNow = Date.now;
  let bridgeCalls = 0;
  let now = realNow();
  let failNext = false;
  Date.now = () => now;
  globalThis.fetch = async () => {
    bridgeCalls++;
    if (failNext) {
      failNext = false;
      return new Response(null, { status: 503 });
    }
    return Response.json({ contractVersion: '1.0' });
  };
  const read = (end = '2026-11-10') =>
    service.read('store', '2026-11-01', end, user);
  try {
    await Promise.all([read(), read()]);
    now += 30 * 60 * 1000 - 1;
    await read();
    assert.equal(bridgeCalls, 1, 'concurrent and repeated reads reuse the result');

    await assert.rejects(
      service.read('store', '2026-11-01', '2026-11-10', {
        ...user,
        accessibleStoreIds: []
      }),
      /无权/
    );
    activeStore = false;
    await assert.rejects(read(), /已闭店/);
    activeStore = true;
    assert.equal(bridgeCalls, 1, 'cache hits still check store access and state');

    now++;
    await read();
    assert.equal(bridgeCalls, 2, 'results expire after 30 minutes');
    failNext = true;
    await assert.rejects(read('2026-11-11'), /HTTP 503/);
    await read('2026-11-11');
    assert.equal(bridgeCalls, 4, 'date ranges are isolated and failures can retry');
  } finally {
    globalThis.fetch = realFetch;
    Date.now = realNow;
  }
  console.log('Usage analytics cache regression checks passed');
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
