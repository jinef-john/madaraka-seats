import { TRAIN_TYPES, FRONTEND_HARDCODE_GUIDANCE } from "@/utils/train-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    {
      trainTypes: TRAIN_TYPES,
      frontendHardcodeGuidance: FRONTEND_HARDCODE_GUIDANCE,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
