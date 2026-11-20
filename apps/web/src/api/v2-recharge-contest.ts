import { request } from './http';

export type RechargeContestLeaderboard = {
  contest: {
    code: string;
    name: string;
    startsAt: string;
    endsAt: string;
    status: string;
    rules: Array<{ min: number; max: number | null; score: number }>;
    lastSyncedAt?: string | null;
    lastFullSyncedAt?: string | null;
    lastSyncError?: string | null;
  };
  items: Array<{
    id: string;
    code: string;
    name: string;
    shortName?: string | null;
    rank: number;
    score: number;
    principal: number;
    count: number;
    latestAt?: string | null;
    bands: Record<string, number>;
  }>;
  salespersonRanking: Array<{
    rank: number;
    storeId: string;
    storeName: string;
    name: string;
    score: number;
    principal: number;
    count: number;
  }>;
  generatedAt: string;
};

export const getRechargeContestLeaderboard = () =>
  request<RechargeContestLeaderboard>('/v2/recharge-contest/leaderboard');

export const syncRechargeContest = () =>
  request<{ mode?: string; fetched?: number; accepted?: number; skipped?: boolean; reason?: string }>(
    '/v2/recharge-contest/sync',
    { method: 'POST' }
  );

export const previewRechargeContestPush = () =>
  request<{ image: string; imageBytes: number; generatedAt: string }>('/v2/recharge-contest/push-preview');

export const pushRechargeContest = () =>
  request<{ pushKey: string; imageBytes: number; results: Array<{ configId: string; status: string; error?: string }> }>('/v2/recharge-contest/push', { method: 'POST' });

export type RechargeContestEntries = {
  page: number;
  pageSize: number;
  total: number;
  stores: Array<{ id: string; name: string; shortName?: string | null; code: string }>;
  items: Array<{
    id: string;
    occurredAt: string;
    category: string;
    cardRef?: string | null;
    principal: string | number;
    reward: string | number;
    score: number;
    transactionNo?: string | null;
    salespersonName?: string | null;
    note?: string | null;
    changeDetails?: string | null;
    store: { id: string; name: string; shortName?: string | null; code: string };
  }>;
};

export const getRechargeContestEntries = (page = 1, storeId = '', bound = 'ALL', card = '', salesperson = '') =>
  request<RechargeContestEntries>(`/v2/recharge-contest/entries?page=${page}&storeId=${encodeURIComponent(storeId)}&bound=${bound}&card=${encodeURIComponent(card)}&salesperson=${encodeURIComponent(salesperson)}`);

export const bindRechargeSalesperson = (id: string, salespersonName: string) =>
  request(`/v2/recharge-contest/entries/${id}/salesperson`, { method: 'PATCH', body: JSON.stringify({ salespersonName }) });

export const updateRechargeContestEntry = (id: string, values: { salespersonName?: string; note?: string }) =>
  request(`/v2/recharge-contest/entries/${id}`, { method: 'PATCH', body: JSON.stringify(values) });
