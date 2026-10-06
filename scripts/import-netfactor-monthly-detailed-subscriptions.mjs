import { existsSync, readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
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

loadDotEnvLocal();

const root = resolve(".");
const runtimeNodeModules = "C:\\Users\\Lorenzo.GMS\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules";
const localNodeModules = resolve(root, "node_modules");
process.env.NODE_PATH = [localNodeModules, runtimeNodeModules, process.env.NODE_PATH].filter(Boolean).join(";");
process.env.PDFJS_MODULE_PATH ??= pathToFileURL(resolve(localNodeModules, "pdfjs-dist/legacy/build/pdf.mjs")).href;

const pdfPath = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
const outputPath = resolve(
  process.argv.find(arg => arg.startsWith("--output="))?.slice("--output=".length) ??
    "work/monthly-detailed-import-report.json"
);

if (!pdfPath) {
  console.error("Usage: node scripts/import-netfactor-monthly-detailed-subscriptions.mjs <monthly-detailed-pdf> [--dry-run]");
  process.exit(1);
}

const { importMonthlyDetailedSubscriptionsFromPdfData } = await import(
  pathToFileURL(resolve("src/integrations/netfactor-monthly-detailed-subscriptions.ts")).href
);

const pdfData = new Uint8Array(await readFile(resolve(pdfPath)));
const result = {
  ...(await importMonthlyDetailedSubscriptionsFromPdfData(pdfData, { dryRun })),
  pdfPath: resolve(pdfPath)
};

await writeFile(outputPath, JSON.stringify(result, null, 2), "utf8");
console.log(JSON.stringify(result, null, 2));
