import { config } from "node:process";
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
const localPlaywright = resolve(localNodeModules, "playwright/index.js");
const localPdfjs = resolve(localNodeModules, "pdfjs-dist/legacy/build/pdf.mjs");
process.env.PLAYWRIGHT_MODULE_PATH ??= pathToFileURL(
  existsSync(localPlaywright) ? localPlaywright : resolve(runtimeNodeModules, "playwright/index.js")
).href;
process.env.PDFJS_MODULE_PATH ??= pathToFileURL(
  existsSync(localPdfjs) ? localPdfjs : resolve(runtimeNodeModules, "pdfjs-dist/legacy/build/pdf.mjs")
).href;

const { captureNetfactorPositionPdf } = await import(
  pathToFileURL(resolve("src/integrations/netfactor-robot.ts")).href
);

const visible = process.argv.includes("--visible");
const result = await captureNetfactorPositionPdf({
  headless: !visible,
  outputDir: "work/netfactor-downloads",
  log: message => console.error(`[netfactor] ${message}`)
});

const { accountPositions, ...summary } = result;
console.log(JSON.stringify(summary, null, 2));
process.exit(0);
