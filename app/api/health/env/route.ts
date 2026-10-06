import { NextResponse } from "next/server";
import { checkRequiredEnv } from "@/src/config/env";

export const runtime = "nodejs";

export async function GET() {
  const env = checkRequiredEnv();

  return NextResponse.json({
    ok: env.ok,
    present: env.present,
    missing: env.missing
  });
}
