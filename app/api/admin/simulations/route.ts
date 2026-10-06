import { NextResponse } from "next/server";
import type { SimulationHistoryRecord } from "@/src/domain/simulation-history";
import { addSimulationHistoryRecord, readSimulationHistoryStore } from "@/src/integrations/simulation-history-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function numberOrZero(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeRecord(payload: Record<string, unknown>): SimulationHistoryRecord {
  const simulationMode = String(payload.simulationMode ?? "prospect");

  return {
    id: String(payload.id || crypto.randomUUID()),
    generatedAt: String(payload.generatedAt || new Date().toISOString()),
    clientId: payload.clientId ? String(payload.clientId) : undefined,
    clientName: String(payload.clientName || "Potencial cliente"),
    accountCode: String(payload.accountCode || ""),
    simulationMode: simulationMode === "general" || simulationMode === "bonas" ? simulationMode : "prospect",
    personType: payload.personType ? String(payload.personType) : undefined,
    sourceBalance: numberOrZero(payload.sourceBalance),
    additionalContribution: numberOrZero(payload.additionalContribution),
    cdiPercentage: numberOrZero(payload.cdiPercentage),
    startDate: String(payload.startDate || ""),
    endDate: String(payload.endDate || ""),
    grossBalance: numberOrZero(payload.grossBalance),
    grossIncome: numberOrZero(payload.grossIncome),
    incomeTax: numberOrZero(payload.incomeTax),
    netIncome: numberOrZero(payload.netIncome),
    grossRate: numberOrZero(payload.grossRate),
    monthlyGrossRate: numberOrZero(payload.monthlyGrossRate),
    netBalance: numberOrZero(payload.netBalance),
    combinedWeightedCdi: numberOrZero(payload.combinedWeightedCdi),
    businessDays: numberOrZero(payload.businessDays),
    elapsedDays: numberOrZero(payload.elapsedDays),
    monthlyCount: numberOrZero(payload.monthlyCount),
    crmOpportunityId: payload.crmOpportunityId ? String(payload.crmOpportunityId) : undefined,
    crmLeadId: payload.crmLeadId ? String(payload.crmLeadId) : undefined
  };
}

export async function GET() {
  const store = await readSimulationHistoryStore();
  return NextResponse.json({ ok: true, ...store });
}

export async function POST(request: Request) {
  const payload = await request.json();
  const record = normalizeRecord(payload);
  const store = await addSimulationHistoryRecord(record);

  return NextResponse.json({ ok: true, record, updatedAt: store.updatedAt, count: store.simulations.length });
}
