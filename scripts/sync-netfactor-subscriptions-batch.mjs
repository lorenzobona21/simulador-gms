import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
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

function numberArg(name, fallback) {
  const arg = process.argv.find(item => item.startsWith(`--${name}=`));
  if (!arg) return fallback;
  const value = Number(arg.slice(name.length + 3));
  return Number.isFinite(value) ? value : fallback;
}

function stringArg(name, fallback) {
  const arg = process.argv.find(item => item.startsWith(`--${name}=`));
  if (!arg) return fallback;
  return arg.slice(name.length + 3);
}

loadDotEnvLocal();

const root = resolve(".");
const runtimeNodeModules = "C:\\Users\\Lorenzo.GMS\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules";
const localNodeModules = resolve(root, "node_modules");
process.env.NODE_PATH = [localNodeModules, runtimeNodeModules, process.env.NODE_PATH].filter(Boolean).join(";");
process.env.PLAYWRIGHT_MODULE_PATH ??= pathToFileURL(resolve(localNodeModules, "playwright/index.js")).href;
process.env.PDFJS_MODULE_PATH ??= pathToFileURL(resolve(localNodeModules, "pdfjs-dist/legacy/build/pdf.mjs")).href;

const limit = numberArg("limit", Number.POSITIVE_INFINITY);
const startAt = numberArg("start-at", 0);
const retries = numberArg("retries", 0);
const timeoutSeconds = numberArg("timeout-seconds", 180);
const visible = process.argv.includes("--visible");
const usePilot = process.argv.includes("--pilot");
const allowOutsideBase = process.argv.includes("--allow-outside-base");
const missingOnly = process.argv.includes("--missing-only");
const pilotFile = stringArg("pilot-file", "config/pilot-investors.json");

const [{ readLatestInvestorReport }, { readInvestorSubscriptionStore }] = await Promise.all([
  import(pathToFileURL(resolve("src/integrations/investor-report-store.ts")).href),
  import(pathToFileURL(resolve("src/integrations/investor-subscription-store.ts")).href)
]);
const { isAllowedClientCode, normalizeClientCode, myClientCodes } = await import(
  pathToFileURL(resolve("src/domain/client-allowlist.ts")).href
);
const skipCodes = new Set(
  stringArg("skip-codes", "")
    .split(",")
    .map(normalizeClientCode)
    .filter(Boolean)
);

const report = usePilot ? undefined : await readLatestInvestorReport();
let alreadySyncedCodes = new Set();

if (missingOnly) {
  try {
    const store = await readInvestorSubscriptionStore();
    alreadySyncedCodes = new Set(Object.keys(store.accounts || {}).map(normalizeClientCode));
  } catch {
    alreadySyncedCodes = new Set();
  }
}

const sourceInvestors = usePilot
  ? JSON.parse(readFileSync(resolve(pilotFile), "utf8"))
  : report.statements.map(statement => ({
      accountCode: statement.positions[0]?.accountCode,
      investorName: statement.clientName
    }));

const outsideBase = sourceInvestors.filter(investor => investor.accountCode && !isAllowedClientCode(investor.accountCode));
if (outsideBase.length && !allowOutsideBase) {
  console.error(
    [
      `[netfactor] Refusing to sync ${outsideBase.length} investor(s) outside data/my-client-codes.json.`,
      `[netfactor] Outside codes: ${outsideBase.map(investor => normalizeClientCode(investor.accountCode)).join(", ")}`,
      "[netfactor] Re-run with --allow-outside-base only after explicit approval."
    ].join("\n")
  );
  process.exit(2);
}

const eligibleInvestors = sourceInvestors
  .filter(investor => investor.accountCode && investor.investorName)
  .filter(investor => allowOutsideBase || isAllowedClientCode(investor.accountCode))
  .filter(investor => !skipCodes.has(normalizeClientCode(investor.accountCode)))
  .filter(investor => !missingOnly || !alreadySyncedCodes.has(normalizeClientCode(investor.accountCode)));
const investors = eligibleInvestors.slice(startAt, startAt + limit);

console.error(
  `[netfactor] base mode: ${allowOutsideBase ? "outside-base allowed by explicit flag" : `allowlist only (${myClientCodes.length} codes)`}`
);
if (missingOnly) {
  console.error(`[netfactor] missing-only: skipping ${alreadySyncedCodes.size} already synced account(s)`);
}
if (skipCodes.size) {
  console.error(`[netfactor] skip-codes: ${[...skipCodes].join(", ")}`);
}

const results = [];

function extractJson(stdout) {
  const trimmed = stdout.trim();
  const start = trimmed.lastIndexOf("\n{");
  const json = start >= 0 ? trimmed.slice(start + 1) : trimmed;
  return JSON.parse(json);
}

function runInvestorSync(investor, attempt) {
  return new Promise(resolveResult => {
    const args = [
      "scripts/sync-netfactor-subscriptions.mjs",
      `--account=${investor.accountCode}`,
      `--name=${investor.investorName}`
    ];
    if (visible) args.push("--visible");
    if (allowOutsideBase) args.push("--allow-outside-base");

    const child = spawn(process.execPath, args, {
      cwd: root,
      env: {
        ...process.env,
        NETFACTOR_PDF_TIMEOUT_MS: process.env.NETFACTOR_PDF_TIMEOUT_MS || String(timeoutSeconds * 1000)
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutSeconds * 1000);

    child.stdout.on("data", chunk => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", chunk => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.on("close", code => {
      clearTimeout(timer);

      if (timedOut) {
        resolveResult({
          ok: false,
          error: `Timed out after ${timeoutSeconds}s.`,
          attempt,
          stdout,
          stderr
        });
        return;
      }

      if (code === 0) {
        try {
          resolveResult({ ok: true, attempt, summary: extractJson(stdout), stdout, stderr });
        } catch (error) {
          resolveResult({
            ok: false,
            attempt,
            error: `Could not parse child output: ${error instanceof Error ? error.message : String(error)}`,
            stdout,
            stderr
          });
        }
        return;
      }

      resolveResult({
        ok: false,
        attempt,
        error: stderr.trim() || stdout.trim() || `Child process exited with code ${code}.`,
        stdout,
        stderr
      });
    });
  });
}

for (const [index, investor] of investors.entries()) {
  const position = startAt + index + 1;
  const total = eligibleInvestors.length;
  const investorStartedAt = Date.now();
  console.error(`[netfactor] ${position}/${total} ${investor.accountCode} - ${investor.investorName}`);

  let lastAttempt;
  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    if (attempt > 1) {
      console.error(`[netfactor] retry ${attempt - 1}/${retries} ${investor.accountCode} - ${investor.investorName}`);
    }
    lastAttempt = await runInvestorSync(investor, attempt);
    if (lastAttempt.ok) break;
  }

  if (lastAttempt?.ok) {
    const summary = lastAttempt.summary;
    results.push({
      ok: true,
      accountCode: summary.accountCode,
      clientName: summary.clientName,
      subscriptions: summary.subscriptions,
      activeSubscriptions: summary.activeSubscriptions,
      totalCurrentValue: summary.totalCurrentValue,
      attempts: lastAttempt.attempt,
      elapsedSeconds: Number(((Date.now() - investorStartedAt) / 1000).toFixed(2))
    });
  } else {
    results.push({
      ok: false,
      accountCode: investor.accountCode,
      clientName: investor.investorName,
      error: lastAttempt?.error || "Unknown error.",
      attempts: lastAttempt?.attempt || 0,
      elapsedSeconds: Number(((Date.now() - investorStartedAt) / 1000).toFixed(2))
    });
  }
}

const ok = results.filter(result => result.ok).length;
const failed = results.length - ok;
const elapsedSeconds = results.reduce((sum, result) => sum + result.elapsedSeconds, 0);
const averageSeconds = results.length ? elapsedSeconds / results.length : 0;

console.log(JSON.stringify({ ok, failed, elapsedSeconds, averageSeconds, results }, null, 2));
process.exit(failed ? 1 : 0);
