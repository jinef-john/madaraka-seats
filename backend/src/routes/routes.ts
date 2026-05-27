import type { Request, Response } from "express";
import type { TrainType } from "../types/train.js";
import { getMeticketsRoutes } from "../utils/metickets.js";

function isTrainType(v: unknown): v is TrainType {
  return v === "express" || v === "inter_county" || v === "phase2";
}

export async function routesHandler(req: Request, res: Response): Promise<void> {
  const { scheduleType, from } = req.query;

  if (!isTrainType(scheduleType)) {
    res.status(400).json({ error: "Invalid scheduleType. Use express, inter_county, or phase2." });
    return;
  }

  try {
    const data = await getMeticketsRoutes(scheduleType, from ? String(from) : undefined);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}
