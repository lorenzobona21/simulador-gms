import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { InvestorReportSyncResult } from "../integrations/investor-report-source.ts";
import type { InvestorSubscriptionStore } from "../integrations/investor-subscription-store.ts";

function loadClientCodes() {
  const configured = String(process.env.GMS_CLIENT_CODES ?? "")
    .split(/[\s,;]+/)
    .map(normalizeClientCode)
    .filter(Boolean);
  if (configured.length) return configured;

  try {
    const contents = readFileSync(join(process.cwd(), "data", "my-client-codes.json"), "utf8");
    const parsed = JSON.parse(contents);
    return Array.isArray(parsed) ? parsed.map(normalizeClientCode).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export const myClientCodes = loadClientCodes();
export const myClientCodeSet = new Set(myClientCodes);

export type AllowlistFilterSummary = {
  allowedCodes: string[];
  visibleCount: number;
  hiddenCount: number;
  hiddenCodes: string[];
};

export function normalizeClientCode(value: unknown) {
  return String(value ?? "").replace(/\D/g, "").replace(/^0+/, "") || "";
}

export function isAllowedClientCode(value: unknown) {
  return myClientCodeSet.has(normalizeClientCode(value));
}

export function accountCodeFromStatement(statement: InvestorReportSyncResult["statements"][number]) {
  return statement.positions.find(position => normalizeClientCode(position.accountCode))?.accountCode ?? "";
}

export function filterInvestorReportToAllowlist(report: InvestorReportSyncResult): InvestorReportSyncResult & {
  allowlist: AllowlistFilterSummary;
} {
  const hiddenCodes = new Set<string>();
  const statements = report.statements
    .map(statement => {
      const positions = statement.positions.filter(position => isAllowedClientCode(position.accountCode));
      if (!positions.length) {
        const hiddenCode = normalizeClientCode(accountCodeFromStatement(statement));
        if (hiddenCode) hiddenCodes.add(hiddenCode);
        return undefined;
      }
      return { ...statement, positions };
    })
    .filter((statement): statement is InvestorReportSyncResult["statements"][number] => Boolean(statement));

  return {
    ...report,
    statements,
    allowlist: {
      allowedCodes: myClientCodes,
      visibleCount: statements.length,
      hiddenCount: report.statements.length - statements.length,
      hiddenCodes: [...hiddenCodes].sort((a, b) => Number(a) - Number(b))
    }
  };
}

export function filterSubscriptionStoreToAllowlist(store?: InvestorSubscriptionStore) {
  if (!store) return undefined;

  return {
    ...store,
    accounts: Object.fromEntries(
      Object.entries(store.accounts).filter(([accountCode]) => isAllowedClientCode(accountCode))
    )
  };
}
