import type { SearchResponse } from "@/types/train";
import { redis } from "@/utils/redis";

const TTL = Math.ceil(
  parseInt(process.env.CACHE_SEARCH_TTL_MS ?? "30000", 10) / 1000,
);

export async function getSearch(key: string): Promise<SearchResponse | null> {
  const data = await redis.get<SearchResponse>(`search:${key}`);
  return data ?? null;
}

export async function setSearch(key: string, data: SearchResponse) {
  await redis.set(`search:${key}`, data, { ex: TTL });
}
