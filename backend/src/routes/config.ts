import type { Request, Response } from "express";
import { TRAIN_TYPES, FRONTEND_HARDCODE_GUIDANCE } from "../utils/train-config.js";

export function configHandler(_req: Request, res: Response): void {
  res.json({ trainTypes: TRAIN_TYPES, frontendHardcodeGuidance: FRONTEND_HARDCODE_GUIDANCE });
}
