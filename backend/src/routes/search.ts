import type { Request, Response } from "express";
import type { TrainType } from "../types/train.js";
import { searchMetickets } from "../utils/metickets.js";
import { getSearch, setSearch } from "../db/search-cache.js";

function isTrainType(v: unknown): v is TrainType {
  return v === "express" || v === "inter_county" || v === "phase2";
}

export async function searchHandler(req: Request, res: Response): Promise<void> {
  const { scheduleType, from, to, date, departure } = req.query;
  const allTrains = req.query.allTrains;

  if (!isTrainType(scheduleType)) {
    res.status(400).json({ error: "Invalid scheduleType. Use express, inter_county, or phase2." });
    return;
  }
  if (!from || !to || !date) {
    res.status(400).json({ error: "Missing required parameters: from, to, date." });
    return;
  }

  const cacheKey = `${scheduleType}|${from}|${to}|${date}|${departure ?? ""}`;

  try {
    const cached = await getSearch(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const data = await searchMetickets({
      scheduleType,
      from: String(from),
      to: String(to),
      date: String(date),
      departure: departure ? String(departure) : undefined,
      allTrains: allTrains === "1" || allTrains === "true" || allTrains === "yes",
    });

    await setSearch(cacheKey, data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}
