import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const textPath = process.argv[2];

if (!textPath) {
  console.error("Usage: node scripts/import-netfactor-subscriptions-text.mjs <netfactor-extrato-text-file>");
  process.exit(1);
}

const resolvedTextPath = resolve(textPath);
if (!existsSync(resolvedTextPath)) {
  console.error(`File not found: ${resolvedTextPath}`);
  process.exit(1);
}

const [{ parseNetfactorSubscriptionText }, { saveInvestorSubscriptionSummary }] = await Promise.all([
  import(pathToFileURL(resolve("src/integrations/netfactor-subscription-parser.ts")).href),
  import(pathToFileURL(resolve("src/integrations/investor-subscription-store.ts")).href)
]);

const parsed = parseNetfactorSubscriptionText(readFileSync(resolvedTextPath, "utf8"));
const syncedAt = new Date().toISOString();
const summary = {
  accountCode: parsed.accountNumber,
  clientName: parsed.debentureHolderName,
  syncedAt,
  source: "manual-file",
  totalCurrentValue: parsed.totalCurrentValue,
  subscriptions: parsed.subscriptions.map(subscription => ({
    accountCode: subscription.accountNumber,
    subscriptionId: subscription.subscriptionId,
    cdiPercentage: subscription.cdiPercentage,
    latestAnnualIndexRate: subscription.latestAnnualIndexRate,
    firstDate: subscription.firstDate,
    latestDate: subscription.latestDate,
    currentValue: subscription.currentValue,
    isRedeemed: subscription.isRedeemed
  }))
};

const savedTo = await saveInvestorSubscriptionSummary(summary);

console.log(
  JSON.stringify(
    {
      savedTo,
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
