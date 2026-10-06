import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function loadDotEnvLocal() {
  const envPath = resolve(".env.local");
  if (!existsSync(envPath)) return;

  const contents = readFileSync(envPath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    process.env[key] ??= value;
  }
}

async function writeStatus(status) {
  const path = resolve("work", "daily-position-sync-status.json");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(status, null, 2), "utf8");
  return path;
}

loadDotEnvLocal();

const confirmed = process.argv.includes("--confirm-netfactor") || process.argv.includes("--scheduled");
if (!confirmed) {
  console.error(
    [
      "[netfactor] This command performs a real NetFactor position sync.",
      "[netfactor] It updates only the daily debenture-holder position used for current balances.",
      "[netfactor] Detailed statements are not synced here.",
      "[netfactor] Re-run with --confirm-netfactor, or use npm run netfactor:daily-position."
    ].join("\n")
  );
  process.exit(2);
}

const startedAt = new Date().toISOString();
const root = resolve(".");
const runtimeNodeModules = "C:\\Users\\Lorenzo.GMS\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules";
const localNodeModules = resolve(root, "node_modules");

process.env.NODE_PATH = [localNodeModules, runtimeNodeModules, process.env.NODE_PATH].filter(Boolean).join(";");
process.env.PLAYWRIGHT_MODULE_PATH ??= pathToFileURL(resolve(localNodeModules, "playwright/index.js")).href;
process.env.PDFJS_MODULE_PATH ??= pathToFileURL(resolve(localNodeModules, "pdfjs-dist/legacy/build/pdf.mjs")).href;
process.env.NETFACTOR_SYNC_MODE = "robot";

try {
  const [{ fetchDailyInvestorReport }, { saveLatestInvestorReport, readLatestInvestorReport }] = await Promise.all([
    import(pathToFileURL(resolve("src/integrations/investor-report-source.ts")).href),
    import(pathToFileURL(resolve("src/integrations/investor-report-store.ts")).href)
  ]);

  const rawResult = await fetchDailyInvestorReport();
  const savedTo = await saveLatestInvestorReport(rawResult);
  const filteredResult = await readLatestInvestorReport();
  const totalBalance = filteredResult.statements.reduce(
    (sum, statement) =>
      sum + statement.positions.reduce((positionSum, position) => positionSum + position.currentBalance, 0),
    0
  );
  const finishedAt = new Date().toISOString();
  const status = {
    ok: true,
    routine: "daily-position",
    source: rawResult.source,
    startedAt,
    finishedAt,
    savedTo,
    visibleClients: filteredResult.statements.length,
    positions: filteredResult.statements.reduce((sum, statement) => sum + statement.positions.length, 0),
    hiddenOutsideBase: filteredResult.allowlist?.hiddenCount ?? 0,
    totalBalance,
    detailedStatementSync: "not-run"
  };

  const statusPath = await writeStatus(status);
  console.log(JSON.stringify({ ...status, statusPath }, null, 2));
  process.exit(0);
} catch (error) {
  const finishedAt = new Date().toISOString();
  const status = {
    ok: false,
    routine: "daily-position",
    startedAt,
    finishedAt,
    error: error instanceof Error ? error.message : String(error),
    detailedStatementSync: "not-run"
  };

  const statusPath = await writeStatus(status);
  console.error(JSON.stringify({ ...status, statusPath }, null, 2));
  process.exit(1);
}
