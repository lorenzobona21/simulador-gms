import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
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

function formatYearMonth(value = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit"
  }).format(value);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: resolve("."),
    env: process.env,
    stdio: "inherit"
  });

  if (result.status !== 0) process.exit(result.status ?? 1);
}

loadDotEnvLocal();

const confirmed = process.argv.includes("--confirm-netfactor") || process.argv.includes("--scheduled");
if (!confirmed) {
  console.error(
    [
      "[netfactor] This command downloads the consolidated monthly detailed subscriptions report.",
      "[netfactor] It uses account range 0..999999 and a blank investor name, then imports only data/my-client-codes.json.",
      "[netfactor] Re-run with --confirm-netfactor after explicit approval."
    ].join("\n")
  );
  process.exit(2);
}

const root = resolve(".");
const runtimeNodeModules = "C:\\Users\\Lorenzo.GMS\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules";
const localNodeModules = resolve(root, "node_modules");
process.env.NODE_PATH = [localNodeModules, runtimeNodeModules, process.env.NODE_PATH].filter(Boolean).join(";");
process.env.PLAYWRIGHT_MODULE_PATH ??= pathToFileURL(resolve(localNodeModules, "playwright/index.js")).href;
process.env.PDFJS_MODULE_PATH ??= pathToFileURL(resolve(localNodeModules, "pdfjs-dist/legacy/build/pdf.mjs")).href;
process.env.NETFACTOR_PDF_TIMEOUT_MS ??= "600000";

const label = `netfactor-extrato-mensal-detalhado-base-${formatYearMonth()}`;
const pdfPath = resolve("work", "netfactor-downloads", `${label}.pdf`);

run(process.execPath, [
  "scripts/capture-netfactor-report-pdf.mjs",
  "nfExtratoMensalDetalhado.jsp",
  label,
  "--account-start=0",
  "--account-end=999999"
]);

run(process.execPath, ["scripts/import-netfactor-monthly-detailed-subscriptions.mjs", pdfPath]);
run(process.execPath, ["scripts/audit-data-quality.mjs"]);
