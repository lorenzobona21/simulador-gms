import { NextResponse } from "next/server";
import { fetchDailyInvestorReport } from "@/src/integrations/investor-report-source";
import { saveLatestInvestorReport } from "@/src/integrations/investor-report-store";

export const runtime = "nodejs";

async function syncInvestorReport(request: Request) {
  const expectedSecret = process.env.GMS_SYNC_SECRET;
  const providedSecret = request.headers.get("authorization")?.replace("Bearer ", "");

  if (expectedSecret && providedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await fetchDailyInvestorReport();
  const savedTo = await saveLatestInvestorReport(result);
  const totalBalance = result.statements.reduce(
    (sum, statement) =>
      sum + statement.positions.reduce((positionSum, position) => positionSum + position.currentBalance, 0),
    0
  );

  return NextResponse.json({
    ok: true,
    source: result.source,
    syncedAt: result.syncedAt,
    statements: result.statements.length,
    positions: result.statements.reduce((sum, statement) => sum + statement.positions.length, 0),
    totalBalance,
    savedTo
  });
}

export async function GET(request: Request) {
  return syncInvestorReport(request);
}

export async function POST(request: Request) {
  return syncInvestorReport(request);
}
