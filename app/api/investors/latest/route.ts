import { NextResponse } from "next/server";
import { readLatestInvestorReport } from "@/src/integrations/investor-report-store";
import { myClientCodes } from "@/src/domain/client-allowlist";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const expectedSecret = process.env.GMS_SYNC_SECRET;
  const providedSecret = request.headers.get("authorization")?.replace("Bearer ", "");

  if (expectedSecret && providedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const report = await readLatestInvestorReport();
    const investors = report.statements.map(statement => {
      const currentBalance = statement.positions.reduce((sum, position) => sum + position.currentBalance, 0);
      return {
        clientId: statement.clientId,
        clientName: statement.clientName,
        accountCode: statement.positions[0]?.accountCode,
        syncedAt: statement.syncedAt,
        balanceDate: statement.positions[0]?.balanceDate,
        currentBalance
      };
    });

    return NextResponse.json({
      ok: true,
      source: report.source,
      syncedAt: report.syncedAt,
      allowedCodes: myClientCodes,
      hiddenOutsideBase: "Clientes fora de data/my-client-codes.json sao filtrados antes desta resposta.",
      investors,
      totalBalance: investors.reduce((sum, investor) => sum + investor.currentBalance, 0)
    });
  } catch {
    return NextResponse.json({ ok: false, error: "No investor report has been synced yet." }, { status: 404 });
  }
}
