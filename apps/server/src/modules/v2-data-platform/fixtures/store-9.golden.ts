import type { V2SourceRecord } from '../domain/reconciliation-engine';

export const store9GoldenRecords: V2SourceRecord[] = [
  {
    sourceModule: 'recharge', sourceRecordId: 'R9-202608', externalStoreId: 'AQXH-4624',
    businessTime: '2026-08-01T01:00:00.000Z', amount: 61085.81,
    payload: { id: 'R9-202608', directRechargePerformance: 61085.81 }
  },
  {
    sourceModule: 'recharge', sourceRecordId: 'R9-202608', externalStoreId: 'AQXH-4624',
    businessTime: '2026-08-01T01:00:00.000Z', amount: 61085.81,
    payload: { id: 'R9-202608', directRechargePerformance: 61085.81, repeatedPage: 2 }
  },
  {
    sourceModule: 'product', sourceRecordId: 'P9-202608', externalStoreId: 'AQXH-4624',
    businessTime: '2026-08-01T01:00:00.000Z', amount: 21488.41,
    payload: { id: 'P9-202608', nonCounterProductSales: 21488.41 }
  },
  {
    sourceModule: 'ota', sourceRecordId: 'O9-NORMAL-202608', externalStoreId: 'AQXH-4624',
    businessTime: '2026-08-01T01:00:00.000Z', amount: 33459.9, productName: '常规团购核销',
    payload: { id: 'O9-NORMAL-202608', name: '常规团购核销', amount: 33459.9 }
  },
  {
    sourceModule: 'ota', sourceRecordId: 'O9-STORED-202608', externalStoreId: 'AQXH-4624',
    businessTime: '2026-08-01T01:00:00.000Z', amount: 165300, productName: '【夏日直播大促】500储值单',
    payload: { id: 'O9-STORED-202608', name: '【夏日直播大促】500储值单', amount: 165300 }
  }
];
