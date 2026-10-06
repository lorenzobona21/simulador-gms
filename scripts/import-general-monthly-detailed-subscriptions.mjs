import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { extractGeneralInvestorSubscriptionsFromPdfData } from "../src/integrations/netfactor-monthly-detailed-subscriptions.ts";
import { saveGeneralInvestorSubscriptionStore } from "../src/integrations/general-investor-subscription-store.ts";

const pdfPath = process.argv[2];

if (!pdfPath) {
  console.error("Uso: node scripts/import-general-monthly-detailed-subscriptions.mjs <extrato-mensal-detalhado.pdf>");
  process.exit(2);
}

const bytes = new Uint8Array(await readFile(resolve(pdfPath)));
const store = await extractGeneralInvestorSubscriptionsFromPdfData(bytes);
const outputPath = await saveGeneralInvestorSubscriptionStore(store);
const accounts = Object.values(store.accounts);
const totalSubscriptions = accounts.reduce((sum, account) => sum + account.subscriptions.length, 0);
const totalBalance = accounts.reduce((sum, account) => sum + account.totalCurrentValue, 0);

console.log(
  JSON.stringify(
    {
      ok: true,
      outputPath,
      clients: accounts.length,
      subscriptions: totalSubscriptions,
      totalBalance
    },
    null,
    2
  )
);
