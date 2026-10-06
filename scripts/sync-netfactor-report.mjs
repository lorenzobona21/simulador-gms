import { pathToFileURL } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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

loadDotEnvLocal();

const allowOutsideBase = process.argv.includes("--allow-outside-base");
if (!allowOutsideBase) {
  console.error(
    [
      "[netfactor] This command captures the broad NetFactor position report.",
      "[netfactor] It is blocked by default in this allowlist project.",
      "[netfactor] Use npm run netfactor:daily-position for the approved daily routine,",
      "[netfactor] or re-run this command with --allow-outside-base only after explicit approval."
    ].join("\n")
  );
  process.exit(2);
}

const root = resolve(".");
const runtimeNodeModules = "C:\\Users\\Lorenzo.GMS\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules";
const localNodeModules = resolve(root, "node_modules");
process.env.NODE_PATH = [resolve(root, "node_modules"), runtimeNodeModules, process.env.NODE_PATH]
  .filter(Boolean)
  .join(";");

process.env.PLAYWRIGHT_MODULE_PATH ??= pathToFileURL(resolve(localNodeModules, "playwright/index.js")).href;
process.env.PDFJS_MODULE_PATH ??= pathToFileURL(resolve(localNodeModules, "pdfjs-dist/legacy/build/pdf.mjs")).href;
process.env.NETFACTOR_SYNC_MODE = "robot";

const { fetchDailyInvestorReport } = await import(
  pathToFileURL(resolve("src/integrations/investor-report-source.ts")).href
);
const { saveLatestInvestorReport } = await import(
  pathToFileURL(resolve("src/integrations/investor-report-store.ts")).href
);

const result = await fetchDailyInvestorReport();
const savedTo = await saveLatestInvestorReport(result);
const totalBalance = result.statements.reduce(
  (sum, statement) => sum + statement.positions.reduce((positionSum, position) => positionSum + position.currentBalance, 0),
  0
);

console.log(
  JSON.stringify(
    {
      ok: true,
      source: result.source,
      syncedAt: result.syncedAt,
      statements: result.statements.length,
      positions: result.statements.reduce((sum, statement) => sum + statement.positions.length, 0),
      totalBalance,
      savedTo
    },
    null,
    2
  )
);

process.exit(0);
