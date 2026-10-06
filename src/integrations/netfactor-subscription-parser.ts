export type NetfactorSubscriptionRow = {
  accountNumber: string;
  debentureHolderName: string;
  subscriptionId: string;
  date: string;
  dailyRate: number;
  retainedTaxBeforeDate: number;
  retainedTaxAfterRate: number;
  cdiPercentage: number;
  annualIndexRate: number;
  originValue: number;
  correctionValue: number;
  rescueValue: number;
  currentValue: number;
};

export type NetfactorSubscriptionSummary = {
  accountNumber: string;
  debentureHolderName: string;
  subscriptionId: string;
  cdiPercentage: number;
  latestAnnualIndexRate: number;
  firstDate: string;
  latestDate: string;
  initialOriginValue: number;
  currentValue: number;
  totalCorrectionValue: number;
  totalRescueValue: number;
  rowsCount: number;
  isRedeemed: boolean;
};

export type NetfactorSubscriptionParseResult = {
  accountNumber: string;
  debentureHolderName: string;
  rows: NetfactorSubscriptionRow[];
  subscriptions: NetfactorSubscriptionSummary[];
  totalCurrentValue: number;
  unmatchedDataLines: string[];
};

const holderPattern = /^(\d+)\s+-\s+(.+)$/;
const rowPattern = new RegExp(
  [
    "^(?<dailyRate>-?[\\d.]+,\\d{6})\\s+",
    "(?<subscriptionId>\\d+)\\s+",
    "(?:(?<retainedTaxBeforeDate>-?[\\d.]+,\\d{2})\\s+)?",
    "(?<date>\\d{2}/\\d{2}/\\d{4})\\s+",
    "(?<cdiPercentage>[\\d.]+)%\\s+do\\s+Indice\\.\\s+",
    "\\((?<annualIndexRate>[\\d.]+)%\\)\\s+",
    "(?<originValue>-?[\\d.]+,\\d{2})\\s+",
    "(?<correctionValue>-?[\\d.]+,\\d{2})\\s+",
    "(?:(?<retainedTaxAfterRate>-?[\\d.]+,\\d{2})\\s+)?",
    "(?<rescueValue>-?[\\d.]+,\\d{2})\\s+",
    "(?<currentValue>-?[\\d.]+,\\d{2})",
    "(?:\\s+.*)?$"
  ].join("")
);

function parseBrazilianNumber(value: string | undefined) {
  if (!value) return 0;
  return Number(value.replace(/\./g, "").replace(",", "."));
}

function parseDotDecimalNumber(value: string | undefined) {
  if (!value) return 0;
  return Number(value);
}

function toIsoDate(value: string) {
  const [day, month, year] = value.split("/");
  return `${year}-${month}-${day}`;
}

function parseRow(line: string, accountNumber: string, debentureHolderName: string): NetfactorSubscriptionRow | undefined {
  const match = rowPattern.exec(line);
  const groups = match?.groups;

  if (!groups) return undefined;

  return {
    accountNumber,
    debentureHolderName,
    subscriptionId: groups.subscriptionId!,
    date: toIsoDate(groups.date!),
    dailyRate: parseBrazilianNumber(groups.dailyRate),
    retainedTaxBeforeDate: parseBrazilianNumber(groups.retainedTaxBeforeDate),
    retainedTaxAfterRate: parseBrazilianNumber(groups.retainedTaxAfterRate),
    cdiPercentage: parseDotDecimalNumber(groups.cdiPercentage),
    annualIndexRate: parseDotDecimalNumber(groups.annualIndexRate),
    originValue: parseBrazilianNumber(groups.originValue),
    correctionValue: parseBrazilianNumber(groups.correctionValue),
    rescueValue: parseBrazilianNumber(groups.rescueValue),
    currentValue: parseBrazilianNumber(groups.currentValue)
  };
}

function summarizeRows(rows: NetfactorSubscriptionRow[]) {
  const rowsBySubscription = new Map<string, NetfactorSubscriptionRow[]>();

  for (const row of rows) {
    const subscriptionRows = rowsBySubscription.get(row.subscriptionId) ?? [];
    subscriptionRows.push(row);
    rowsBySubscription.set(row.subscriptionId, subscriptionRows);
  }

  const summaries: NetfactorSubscriptionSummary[] = [];

  for (const [subscriptionId, subscriptionRows] of rowsBySubscription) {
    subscriptionRows.sort((left, right) => left.date.localeCompare(right.date));
    const firstRow = subscriptionRows[0]!;
    const latestRow = subscriptionRows[subscriptionRows.length - 1]!;

    summaries.push({
      accountNumber: latestRow.accountNumber,
      debentureHolderName: latestRow.debentureHolderName,
      subscriptionId,
      cdiPercentage: latestRow.cdiPercentage,
      latestAnnualIndexRate: latestRow.annualIndexRate,
      firstDate: firstRow.date,
      latestDate: latestRow.date,
      initialOriginValue: firstRow.originValue,
      currentValue: latestRow.currentValue,
      totalCorrectionValue: subscriptionRows.reduce((sum, row) => sum + row.correctionValue, 0),
      totalRescueValue: subscriptionRows.reduce((sum, row) => sum + row.rescueValue, 0),
      rowsCount: subscriptionRows.length,
      isRedeemed: latestRow.currentValue <= 0.005
    });
  }

  return summaries.sort((left, right) => Number(left.subscriptionId) - Number(right.subscriptionId));
}

export function parseNetfactorSubscriptionText(text: string): NetfactorSubscriptionParseResult {
  let accountNumber = "";
  let debentureHolderName = "";
  const rows: NetfactorSubscriptionRow[] = [];
  const unmatchedDataLines: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const holderMatch = holderPattern.exec(line);
    if (holderMatch) {
      accountNumber = holderMatch[1]!;
      debentureHolderName = holderMatch[2]!.trim();
      continue;
    }

    if (!accountNumber || !debentureHolderName) continue;

    const row = parseRow(line, accountNumber, debentureHolderName);
    if (row) {
      rows.push(row);
    } else if (/^-?[\d.]+,\d{6}\s+\d+\s+/.test(line)) {
      unmatchedDataLines.push(line);
    }
  }

  const subscriptions = summarizeRows(rows);

  return {
    accountNumber,
    debentureHolderName,
    rows,
    subscriptions,
    totalCurrentValue: subscriptions.reduce((sum, subscription) => sum + subscription.currentValue, 0),
    unmatchedDataLines
  };
}
