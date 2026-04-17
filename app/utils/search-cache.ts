import type { SearchResponse } from "@/types/train";

const TTL = parseInt(process.env.CACHE_SEARCH_TTL_MS ?? "30000", 10);

interface Entry {
  data: SearchResponse;
  at: number;
}

const store = new Map<string, Entry>();

export function getSearch(key: string): SearchResponse | null {
  const e = store.get(key);
  if (!e) return null;
  if (Date.now() - e.at > TTL) {
    store.delete(key);
    return null;
  }
  return e.data;
}

export function setSearch(key: string, data: SearchResponse) {
  store.set(key, { data, at: Date.now() });
}
