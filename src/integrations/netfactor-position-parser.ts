export type NetfactorPositionRow = {
  date: string;
  subscriptionId: string;
  accountNumber: string;
  debentureHolderName: string;
  quantity: number;
  purchaseValue: number;
  correctedValue: number;
  yieldValue: number;
  yieldPercent: number;
  irrfValue: number;
  redeemedValue: number;
  principalRedemption: number;
  yieldRedemption: number;
  earlyRedemptionIr: number;
  lastMonthYieldValue: number;
  lastMonthYieldPercent: number;
  currentGrossValue: number;
  currentNetValue: number;
};

export type NetfactorAccountPosition = {
  accountNumber: string;
  debentureHolderName: string;
  rows: NetfactorPositionRow[];
  totalQuantity: number;
  totalPurchaseValue: number;
  totalCurrentGrossValue: number;
  totalCurrentNetValue: number;
};

export type NetfactorPositionParseResult = {
  rows: NetfactorPositionRow[];
  accounts: NetfactorAccountPosition[];
  unmatchedDataLines: string[];
};

const rowPattern = new RegExp(
  [
    "^(?<date>\\d{2}/\\d{2}/\\d{4})\\s+-\\s+",
    "(?<subscriptionId>\\d+)\\s+",
    "\\((?<accountNumber>\\d+)\\)\\s+",
    "(?<debentureHolderName>.+?)\\s+",
    "(?<quantity>\\d+)\\s+",
    "(?<purchaseValue>[\\d.]+,\\d{2})\\s+",
    "(?<correctedValue>[\\d.]+,\\d{2})\\s+",
    "(?<yieldValue>[\\d.]+,\\d{2})\\s+",
    "(?<yieldPercent>[\\d.]+,\\d{2})\\s+%\\s+",
    "(?<irrfValue>[\\d.]+,\\d{2})\\s+",
    "(?<redeemedValue>[\\d.]+,\\d{2})\\s+",
    "(?<principalRedemption>[\\d.]+,\\d{2})\\s+",
    "(?<yieldRedemption>[\\d.]+,\\d{2})\\s+",
    "(?<earlyRedemptionIr>[\\d.]+,\\d{2})\\s+",
    "(?<lastMonthYieldValue>[\\d.]+,\\d{2})\\s+",
    "(?<lastMonthYieldPercent>[\\d.]+,\\d{2})\\s+%\\s+%?\\s+",
    "(?<currentGrossValue>[\\d.]+,\\d{2})\\s+",
    "(?<currentNetValue>[\\d.]+,\\d{2})$"
  ].join("")
);

const groupedMoneyPattern = "[\\d.]+,(?:\\d{2})?";

const groupedRowPattern = new RegExp(
  [
    "^GROUPED\\s+",
    "\\((?<accountNumber>\\d+)\\)\\s+",
    "(?<debentureHolderName>.+?)\\s+",
    "(?<quantity>\\d+(?:,\\d+)?)\\s+",
    `(?<purchaseValue>${groupedMoneyPattern})\\s+`,
    `(?<correctedValue>${groupedMoneyPattern})\\s+`,
    `(?<yieldValue>${groupedMoneyPattern})\\s+`,
    `(?<yieldPercent>${groupedMoneyPattern})\\s+%\\s+`,
    `(?<irrfValue>${groupedMoneyPattern})\\s+`,
    `(?<earlyRedemptionValue>${groupedMoneyPattern})\\s+`,
    `(?<earlyRedemptionIr>${groupedMoneyPattern})\\s+`,
    `(?<lastMonthYieldValue>${groupedMoneyPattern})\\s+`,
    `(?<lastMonthYieldPercent>${groupedMoneyPattern})\\s+%\\s+`,
    `(?<currentValue>${groupedMoneyPattern})$`
  ].join("")
);

function parseBrazilianNumber(value: string) {
  const normalizedValue = value.endsWith(",") ? `${value}00` : value;
  return Number(normalizedValue.replace(/\./g, "").replace(",", "."));
}

function parseRow(line: string): NetfactorPositionRow | undefined {
  const match = rowPattern.exec(line.trim());
  const groups = match?.groups;

  if (!groups) return undefined;

  return {
    date: groups.date!,
    subscriptionId: groups.subscriptionId!,
    accountNumber: groups.accountNumber!,
    debentureHolderName: groups.debentureHolderName!.trim(),
    quantity: Number(groups.quantity),
    purchaseValue: parseBrazilianNumber(groups.purchaseValue!),
    correctedValue: parseBrazilianNumber(groups.correctedValue!),
    yieldValue: parseBrazilianNumber(groups.yieldValue!),
    yieldPercent: parseBrazilianNumber(groups.yieldPercent!),
    irrfValue: parseBrazilianNumber(groups.irrfValue!),
    redeemedValue: parseBrazilianNumber(groups.redeemedValue!),
    principalRedemption: parseBrazilianNumber(groups.principalRedemption!),
    yieldRedemption: parseBrazilianNumber(groups.yieldRedemption!),
    earlyRedemptionIr: parseBrazilianNumber(groups.earlyRedemptionIr!),
    lastMonthYieldValue: parseBrazilianNumber(groups.lastMonthYieldValue!),
    lastMonthYieldPercent: parseBrazilianNumber(groups.lastMonthYieldPercent!),
    currentGrossValue: parseBrazilianNumber(groups.currentGrossValue!),
    currentNetValue: parseBrazilianNumber(groups.currentNetValue!)
  };
}

function parseGroupedRow(line: string): NetfactorPositionRow | undefined {
  const match = groupedRowPattern.exec(line.trim());
  const groups = match?.groups;

  if (!groups) return undefined;

  return {
    date: "",
    subscriptionId: "",
    accountNumber: groups.accountNumber!,
    debentureHolderName: groups.debentureHolderName!.trim(),
    quantity: parseBrazilianNumber(groups.quantity!),
    purchaseValue: parseBrazilianNumber(groups.purchaseValue!),
    correctedValue: parseBrazilianNumber(groups.correctedValue!),
    yieldValue: parseBrazilianNumber(groups.yieldValue!),
    yieldPercent: parseBrazilianNumber(groups.yieldPercent!),
    irrfValue: parseBrazilianNumber(groups.irrfValue!),
    redeemedValue: parseBrazilianNumber(groups.earlyRedemptionValue!),
    principalRedemption: parseBrazilianNumber(groups.earlyRedemptionValue!),
    yieldRedemption: 0,
    earlyRedemptionIr: parseBrazilianNumber(groups.earlyRedemptionIr!),
    lastMonthYieldValue: parseBrazilianNumber(groups.lastMonthYieldValue!),
    lastMonthYieldPercent: parseBrazilianNumber(groups.lastMonthYieldPercent!),
    currentGrossValue: parseBrazilianNumber(groups.currentValue!),
    currentNetValue: parseBrazilianNumber(groups.currentValue!)
  };
}

export function parseNetfactorPositionText(text: string): NetfactorPositionParseResult {
  const rows: NetfactorPositionRow[] = [];
  const unmatchedDataLines: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const row = parseRow(line) ?? parseGroupedRow(line);
    if (row) {
      rows.push(row);
    } else if (/^\d{2}\/\d{2}\/\d{4}\s+-\s+/.test(line)) {
      unmatchedDataLines.push(line);
    }
  }

  const accountsByNumber = new Map<string, NetfactorAccountPosition>();

  for (const row of rows) {
    const account = accountsByNumber.get(row.accountNumber) ?? {
      accountNumber: row.accountNumber,
      debentureHolderName: row.debentureHolderName,
      rows: [],
      totalQuantity: 0,
      totalPurchaseValue: 0,
      totalCurrentGrossValue: 0,
      totalCurrentNetValue: 0
    };

    account.rows.push(row);
    account.totalQuantity += row.quantity;
    account.totalPurchaseValue += row.purchaseValue;
    account.totalCurrentGrossValue += row.currentGrossValue;
    account.totalCurrentNetValue += row.currentNetValue;
    accountsByNumber.set(row.accountNumber, account);
  }

  return {
    rows,
    accounts: [...accountsByNumber.values()],
    unmatchedDataLines
  };
}
