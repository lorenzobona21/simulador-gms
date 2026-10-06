import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath) {
  console.error("Usage: node scripts/parse-netfactor-subscriptions.mjs <text-file> [output-json]");
  process.exit(1);
}

const resolvedInputPath = resolve(inputPath);
if (!existsSync(resolvedInputPath)) {
  console.error(`File not found: ${resolvedInputPath}`);
  process.exit(1);
}

const { parseNetfactorSubscriptionText } = await import(
  pathToFileURL(resolve("src/integrations/netfactor-subscription-parser.ts")).href
);

const text = readFileSync(resolvedInputPath, "utf8");
const parsed = parseNetfactorSubscriptionText(text);
const summary = {
  accountNumber: parsed.accountNumber,
  debentureHolderName: parsed.debentureHolderName,
  rows: parsed.rows.length,
  subscriptions: parsed.subscriptions.length,
  activeSubscriptions: parsed.subscriptions.filter(subscription => !subscription.isRedeemed).length,
  redeemedSubscriptions: parsed.subscriptions.filter(subscription => subscription.isRedeemed).length,
  totalCurrentValue: parsed.totalCurrentValue,
  unmatchedDataLines: parsed.unmatchedDataLines.length,
  subscriptionDetails: parsed.subscriptions
};

const json = JSON.stringify(summary, null, 2);

if (outputPath) {
  const resolvedOutputPath = resolve(outputPath);
  writeFileSync(resolvedOutputPath, `${json}\n`, "utf8");
  console.log(`Saved ${resolvedOutputPath}`);
} else {
  console.log(json);
}
