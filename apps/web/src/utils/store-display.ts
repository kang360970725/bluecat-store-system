export type StoreDisplaySource = { name: string; shortName?: string | null };

export function storeDisplayName(store?: StoreDisplaySource | null) {
  return store?.shortName?.trim() || store?.name || '';
}
