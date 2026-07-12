import { request } from './http';

export type ScoreItem = {
  id: string;
  categoryCode: string;
  categoryName: string;
  name: string;
  code: string;
  description?: string | null;
  formulaNote?: string | null;
  maxScore?: number | null;
  minScore?: number | null;
  sort: number;
  enabled: boolean;
};

export type StoreScoreRow = {
  store: {
    id: string;
    name: string;
    code: string;
  };
  scores: Array<{
    itemId: string;
    rawValue: number;
    score: number;
    remark: string;
    maxScore: number;
    minScore: number;
  }>;
  totalScore: number;
};

export type MonthlyScoringResult = {
  month: string;
  items: ScoreItem[];
  rows: StoreScoreRow[];
};

export function listMonthlyScoring(month: string) {
  return request<MonthlyScoringResult>(
    `/scoring/monthly?month=${encodeURIComponent(month)}`
  );
}

export function upsertScoreEntry(payload: {
  storeId: string;
  itemId: string;
  month: string;
  rawValue?: number | null;
  score: number;
  remark?: string;
}) {
  return request('/scoring/entries', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
