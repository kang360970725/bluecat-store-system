import { createHash } from 'node:crypto';

export type V2SourceModule = 'recharge' | 'product' | 'ota';
export type V2EventType = 'RECHARGE_PRINCIPAL' | 'PRODUCT_SALE' | 'OTA_REDEEM';

export type V2SourceRecord = {
  sourceModule: V2SourceModule;
  sourceRecordId: string;
  externalStoreId: string;
  businessTime: string;
  amount: number;
  productName?: string;
  payload: Record<string, unknown>;
};

export type V2RuleResult = {
  rawRecordHash: string;
  sourceModule: V2SourceModule;
  sourceRecordId: string;
  eventType: V2EventType;
  businessKey: string;
  amount: number;
  decision: 'INCLUDED' | 'EXCLUDED';
  ruleCode: string;
  reason: string;
  duplicateOf?: string;
};

export type V2ReconciliationResult = {
  externalStoreId: string;
  ruleSetVersion: 'golden-9-v1';
  includedAmount: number;
  excludedAmount: number;
  authoritativeAmount: number;
  differenceAmount: number;
  events: V2RuleResult[];
  resultHash: string;
};

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function stableHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function eventTypeOf(module: V2SourceModule): V2EventType {
  if (module === 'recharge') return 'RECHARGE_PRINCIPAL';
  if (module === 'product') return 'PRODUCT_SALE';
  return 'OTA_REDEEM';
}

export function reconcileGoldenStore9(
  records: V2SourceRecord[],
  authoritativeAmount = 116087
): V2ReconciliationResult {
  const ordered = [...records].sort((left, right) => {
    const businessOrder = `${left.sourceModule}:${left.sourceRecordId}`
      .localeCompare(`${right.sourceModule}:${right.sourceRecordId}`);
    return businessOrder || stableHash(left.payload).localeCompare(stableHash(right.payload));
  });
  const firstByBusinessKey = new Map<string, string>();
  const events = ordered.map<V2RuleResult>((record) => {
    const businessKey = `${record.sourceModule}:${record.sourceRecordId}`;
    const rawRecordHash = stableHash(record.payload);
    const duplicateOf = firstByBusinessKey.get(businessKey);
    if (duplicateOf) {
      return {
        rawRecordHash,
        sourceModule: record.sourceModule,
        sourceRecordId: record.sourceRecordId,
        eventType: eventTypeOf(record.sourceModule),
        businessKey,
        amount: roundMoney(record.amount),
        decision: 'EXCLUDED',
        ruleCode: 'DEDUP_SOURCE_BUSINESS_KEY_V1',
        reason: '同一来源业务主键重复，仅保留首条记录',
        duplicateOf
      };
    }
    firstByBusinessKey.set(businessKey, rawRecordHash);

    const isStoredValueOta = record.sourceModule === 'ota'
      && /储值|充值/.test(record.productName ?? '');
    return {
      rawRecordHash,
      sourceModule: record.sourceModule,
      sourceRecordId: record.sourceRecordId,
      eventType: eventTypeOf(record.sourceModule),
      businessKey,
      amount: roundMoney(record.amount),
      decision: isStoredValueOta ? 'EXCLUDED' : 'INCLUDED',
      ruleCode: isStoredValueOta ? 'OTA_STORED_VALUE_OVERLAP_V1' : 'MAIN_REVENUE_INCLUDE_V1',
      reason: isStoredValueOta
        ? '储值型 OTA 与充值业务代表同一笔业务，避免跨来源重复累计'
        : '黄金样本已确认的主营收入事件'
    };
  });
  const includedAmount = roundMoney(events
    .filter((event) => event.decision === 'INCLUDED')
    .reduce((total, event) => total + event.amount, 0));
  const excludedAmount = roundMoney(events
    .filter((event) => event.decision === 'EXCLUDED')
    .reduce((total, event) => total + event.amount, 0));
  const base = {
    externalStoreId: 'AQXH-4624',
    ruleSetVersion: 'golden-9-v1' as const,
    includedAmount,
    excludedAmount,
    authoritativeAmount,
    differenceAmount: roundMoney(includedAmount - authoritativeAmount),
    events
  };
  return { ...base, resultHash: stableHash(base) };
}
