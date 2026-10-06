import { readFile } from "node:fs/promises";
import { parseNetfactorSubscriptionText } from "./netfactor-subscription-parser.ts";
import { captureNetfactorGenericReportPdf } from "./netfactor-robot.ts";
import type { InvestorSubscriptionSummary } from "./investor-subscription-store";

export type FetchInvestorSubscriptionsOptions = {
  accountCode: string;
  investorName: string;
  headless?: boolean;
  outputDir?: string;
  log?: (message: string) => void;
};

function safeLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export async function fetchNetfactorInvestorSubscriptions(
  options: FetchInvestorSubscriptionsOptions
): Promise<InvestorSubscriptionSummary> {
  const label = `netfactor-extrato-analitico-${options.accountCode}-${safeLabel(options.investorName)}`;
  const report = await captureNetfactorGenericReportPdf({
    target: "nfRelatorioInformativoCorrecoes.jsp",
    label,
    accountCode: options.accountCode,
    investorName: options.investorName,
    headless: options.headless,
    outputDir: options.outputDir,
    log: options.log
  });

  const text = await readFile(report.textPath, "utf8");
  const parsed = parseNetfactorSubscriptionText(text);
  const syncedAt = new Date().toISOString();

  return {
    accountCode: parsed.accountNumber || options.accountCode,
    clientName: parsed.debentureHolderName || options.investorName,
    syncedAt,
    source: "netfactor-robot",
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
}
