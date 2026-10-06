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

const root = resolve(".");
const runtimeNodeModules = "C:\\Users\\Lorenzo.GMS\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules";
const localNodeModules = resolve(root, "node_modules");
process.env.NODE_PATH = [resolve(root, "node_modules"), runtimeNodeModules, process.env.NODE_PATH]
  .filter(Boolean)
  .join(";");

process.env.PLAYWRIGHT_MODULE_PATH ??= pathToFileURL(resolve(localNodeModules, "playwright/index.js")).href;
process.env.PDFJS_MODULE_PATH ??= pathToFileURL(resolve(localNodeModules, "pdfjs-dist/legacy/build/pdf.mjs")).href;

const target = process.argv[2];
const label = process.argv[3] || "netfactor-report";
const visible = process.argv.includes("--visible");
const accountArg = process.argv.find(arg => arg.startsWith("--account="));
const accountStartArg = process.argv.find(arg => arg.startsWith("--account-start="));
const accountEndArg = process.argv.find(arg => arg.startsWith("--account-end="));
const nameArg = process.argv.find(arg => arg.startsWith("--name="));
const accountCode = accountArg?.slice("--account=".length);
const accountCodeStart = accountStartArg?.slice("--account-start=".length);
const accountCodeEnd = accountEndArg?.slice("--account-end=".length);
const investorName = nameArg?.slice("--name=".length);

if (!target) {
  console.error("Usage: node scripts/capture-netfactor-report-pdf.mjs <target-jsp> <label> [--visible]");
  process.exit(1);
}

const { captureNetfactorGenericReportPdf } = await import(
  pathToFileURL(resolve("src/integrations/netfactor-robot.ts")).href
);

const result = await captureNetfactorGenericReportPdf({
  target,
  label,
  accountCode,
  accountCodeStart,
  accountCodeEnd,
  investorName,
  headless: !visible,
  outputDir: "work/netfactor-downloads",
  log: message => console.error(`[netfactor] ${message}`)
});

console.log(JSON.stringify(result, null, 2));
process.exit(0);
