import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function normalizeClientCode(value) {
  return String(value ?? "").replace(/\D/g, "").replace(/^0+/, "") || "";
}

function weightedAverage(subscriptions) {
  const active = subscriptions.filter(subscription => !subscription.isRedeemed && subscription.currentValue > 0);
  const total = active.reduce((sum, subscription) => sum + subscription.currentValue, 0);
  if (!total) return undefined;
  return active.reduce((sum, subscription) => sum + subscription.currentValue * subscription.cdiPercentage, 0) / total;
}

function statusFor({ hasDailyPosition, hasDetailedStatement, mismatch }) {
  if (!hasDailyPosition) return "missing_daily_position";
  if (!hasDetailedStatement) return "missing_detailed_statement";
  if (mismatch) return "detailed_statement_mismatch";
  return "verified";
}

const reportPath = resolve(process.argv.find(arg => arg.startsWith("--report="))?.slice("--report=".length) ?? "work/latest-investor-report.json");
const subscriptionsPath = resolve(
  process.argv.find(arg => arg.startsWith("--subscriptions="))?.slice("--subscriptions=".length) ?? "work/latest-investor-subscriptions.json"
);
const allowlistPath = resolve(process.argv.find(arg => arg.startsWith("--allowlist="))?.slice("--allowlist=".length) ?? "data/my-client-codes.json");
const outputPath = resolve(process.argv.find(arg => arg.startsWith("--output="))?.slice("--output=".length) ?? "work/data-quality-report.json");

if (!existsSync(reportPath)) throw new Error(`Arquivo de posição diária não encontrado: ${reportPath}`);
if (!existsSync(subscriptionsPath)) throw new Error(`Arquivo de extrato detalhado não encontrado: ${subscriptionsPath}`);

const allowlist = readJson(allowlistPath).map(normalizeClientCode);
const report = readJson(reportPath);
const subscriptions = readJson(subscriptionsPath);

const statementsByCode = new Map(
  (report.statements ?? []).map(statement => [
    normalizeClientCode(statement.positions?.[0]?.accountCode),
    statement
  ])
);

const rows = allowlist.map(accountCode => {
  const statement = statementsByCode.get(accountCode);
  const detail = subscriptions.accounts?.[accountCode];
  const positionBalance = statement?.positions?.reduce((sum, position) => sum + (position.currentBalance ?? 0), 0);
  const detailedBalance = detail?.totalCurrentValue ?? 0;
  const activeSubscriptions = detail?.subscriptions?.filter(subscription => !subscription.isRedeemed && subscription.currentValue > 0) ?? [];
  const difference = positionBalance !== undefined && detail ? Math.abs(positionBalance - detailedBalance) : 0;
  const tolerance = positionBalance !== undefined ? Math.max(1, positionBalance * 0.01) : 0;
  const dailySyncedAt = statement?.syncedAt ?? report.syncedAt;
  const detailedSyncedAt = detail?.syncedAt;
  const detailIsPreferred = Boolean(detail);
  const mismatch = positionBalance !== undefined && detail !== undefined && !detailIsPreferred && difference > tolerance;
  const status = statusFor({
    hasDailyPosition: Boolean(statement),
    hasDetailedStatement: Boolean(detail),
    mismatch
  });

  return {
    accountCode,
    clientName: statement?.clientName ?? detail?.clientName ?? accountCode,
    status,
    positionBalance: positionBalance ?? 0,
    detailedBalance,
    difference,
    tolerance,
    activeSubscriptions: activeSubscriptions.length,
    weightedCdiPercentage: weightedAverage(activeSubscriptions),
    balanceSource: detailIsPreferred ? "monthly_detailed_statement" : "daily_position",
    dailySyncedAt,
    detailedSyncedAt
  };
});

const byStatus = rows.reduce((summary, row) => {
  summary[row.status] = (summary[row.status] ?? 0) + 1;
  return summary;
}, {});

const summary = {
  generatedAt: new Date().toISOString(),
  totalClients: rows.length,
  verifiedClients: byStatus.verified ?? 0,
  missingDailyPosition: byStatus.missing_daily_position ?? 0,
  missingDetailedStatement: byStatus.missing_detailed_statement ?? 0,
  detailedStatementMismatch: byStatus.detailed_statement_mismatch ?? 0,
  totalPositionBalance: rows.reduce((sum, row) => sum + row.positionBalance, 0),
  totalDetailedBalance: rows.reduce((sum, row) => sum + row.detailedBalance, 0)
};

const result = {
  summary,
  rows: rows.sort((left, right) => {
    if (left.status !== right.status) return left.status.localeCompare(right.status);
    return right.difference - left.difference;
  })
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(result, null, 2), "utf8");

console.log(`Relatório salvo em ${outputPath}`);
console.log(`Clientes verificados: ${summary.verifiedClients}/${summary.totalClients}`);
console.log(`Extratos divergentes: ${summary.detailedStatementMismatch}`);
console.log(`Sem extrato detalhado: ${summary.missingDetailedStatement}`);
console.log(`Sem posição diária: ${summary.missingDailyPosition}`);

for (const row of result.rows.filter(row => row.status === "detailed_statement_mismatch").slice(0, 15)) {
  console.log(
    [
      row.accountCode,
      row.clientName,
      `posição ${money.format(row.positionBalance)}`,
      `extrato ${money.format(row.detailedBalance)}`,
      `diferença ${money.format(row.difference)}`
    ].join(" | ")
  );
}
