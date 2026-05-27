import { pool } from "./index.js";
import type { SearchResponse } from "../types/train.js";

const TTL_MS = parseInt(process.env.CACHE_SEARCH_TTL_MS ?? "30000", 10);

export async function getSearch(key: string): Promise<SearchResponse | null> {
  const res = await pool.query<{ data: SearchResponse }>(
    `SELECT data FROM search_cache WHERE cache_key = $1 AND expires_at > NOW()`,
    [key],
  );
  return res.rows[0]?.data ?? null;
}

export async function setSearch(key: string, data: SearchResponse): Promise<void> {
  const expiresAt = new Date(Date.now() + TTL_MS);
  await pool.query(
    `INSERT INTO search_cache (cache_key, data, expires_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (cache_key)
     DO UPDATE SET data = EXCLUDED.data, expires_at = EXCLUDED.expires_at`,
    [key, JSON.stringify(data), expiresAt.toISOString()],
  );
}

export async function pruneExpiredSearch(): Promise<void> {
  await pool.query(`DELETE FROM search_cache WHERE expires_at <= NOW()`);
}
