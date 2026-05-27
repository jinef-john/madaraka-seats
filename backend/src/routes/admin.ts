import type { Request, Response } from "express";
import { refresh } from "../scheduler/index.js";
import { flushMonthCache } from "../db/month-cache.js";

function checkAuth(req: Request, res: Response): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return true;
  if (req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

export async function refreshHandler(req: Request, res: Response): Promise<void> {
  if (!checkAuth(req, res)) return;
  // Fire and forget — don't block the response
  refresh().catch((err) => console.error("[admin] manual refresh failed:", err));
  res.json({ ok: true, message: "Refresh started" });
}

export async function flushHandler(req: Request, res: Response): Promise<void> {
  if (!checkAuth(req, res)) return;
  const count = await flushMonthCache();
  res.json({ flushed: count });
}
