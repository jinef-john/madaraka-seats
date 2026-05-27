import type { Request, Response } from "express";
import type { TrainType } from "../types/train.js";
import { getMonth, setMonth } from "../db/month-cache.js";
import { scrapeMonth } from "../utils/scraper.js";

function isTrainType(v: unknown): v is TrainType {
  return v === "express" || v === "inter_county" || v === "phase2";
}

export async function monthHandler(req: Request, res: Response): Promise<void> {
  const { scheduleType, from, to } = req.query;
  const now = new Date();
  const year = parseInt(String(req.query.year ?? now.getFullYear()), 10);
  const month = parseInt(String(req.query.month ?? now.getMonth() + 1), 10);

  if (!isTrainType(scheduleType)) {
    res.status(400).json({ error: "Invalid scheduleType. Use express, inter_county, or phase2." });
    return;
  }
  if (!from || !to) {
    res.status(400).json({ error: "Missing required parameters: from and to." });
    return;
  }
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    res.status(400).json({ error: "Invalid year or month." });
    return;
  }

  try {
    const cached = await getMonth(scheduleType, String(from), String(to), year, month);
    if (cached) {
      res.json({ scheduleType, from, to, year, month, days: cached });
      return;
    }

    // Not in cache yet — return empty immediately and scrape in background.
    // The scheduler will populate the cache; the client should retry shortly.
    res.json({ scheduleType, from, to, year, month, days: [], loading: true });

    // Fire-and-forget scrape to populate cache for next request
    scrapeMonth(scheduleType, String(from), String(to), year, month)
      .then((days) => setMonth(scheduleType, String(from), String(to), year, month, days))
      .catch(() => {});
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}
