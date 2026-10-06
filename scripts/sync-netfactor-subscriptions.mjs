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

loadDotEnvLocal();

const root = resolve(".");
const runtimeNodeModules = "C:\\Users\\Lorenzo.GMS\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules";
const localNodeModules = resolve(root, "node_modules");
process.env.NODE_PATH = [localNodeModules, runtimeNodeModules, process.env.NODE_PATH].filter(Boolean).join(";");
process.env.PLAYWRIGHT_MODULE_PATH ??= pathToFileURL(resolve(localNodeModules, "playwright/index.js")).href;
process.env.PDFJS_MODULE_PATH ??= pathToFileURL(resolve(localNodeModules, "pdfjs-dist/legacy/build/pdf.mjs")).href;

const accountArg = process.argv.find(arg => arg.startsWith("--account="));
const nameArg = process.argv.find(arg => arg.startsWith("--name="));
const visible = process.argv.includes("--visible");
const allowOutsideBase = process.argv.includes("--allow-outside-base");
const accountCode = accountArg?.slice("--account=".length);
const investorName = nameArg?.slice("--name=".length);

if (!accountCode || !investorName) {
  console.error('Usage: node scripts/sync-netfactor-subscriptions.mjs --account=171 --name="PAULO RICARDO BONA" [--visible]');
  process.exit(1);
}

const [{ fetchNetfactorInvestorSubscriptions }, { saveInvestorSubscriptionSummary }, { isAllowedClientCode }] =
  await Promise.all([
    import(pathToFileURL(resolve("src/integrations/investor-subscription-source.ts")).href),
    import(pathToFileURL(resolve("src/integrations/investor-subscription-store.ts")).href),
    import(pathToFileURL(resolve("src/domain/client-allowlist.ts")).href)
  ]);

if (!allowOutsideBase && !isAllowedClientCode(accountCode)) {
  console.error(
    `[netfactor] Refusing to sync account ${accountCode}: outside data/my-client-codes.json. Use --allow-outside-base only after explicit approval.`
  );
  process.exit(2);
}

const summary = await fetchNetfactorInvestorSubscriptions({
  accountCode,
  investorName,
  headless: !visible,
  outputDir: "work/netfactor-downloads",
  log: message => console.error(`[netfactor] ${message}`)
});

const path = await saveInvestorSubscriptionSummary(summary);

console.log(
  JSON.stringify(
    {
      savedTo: path,
      accountCode: summary.accountCode,
      clientName: summary.clientName,
      subscriptions: summary.subscriptions.length,
      activeSubscriptions: summary.subscriptions.filter(subscription => !subscription.isRedeemed).length,
      totalCurrentValue: summary.totalCurrentValue
    },
    null,
    2
  )
);

process.exit(0);
