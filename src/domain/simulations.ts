export type RateChange = {
  date: string;
  label: string;
  rate: number;
};

export type SimulationInput = {
  id: string;
  clientId: string;
  title: string;
  sourceBalance: number;
  additionalContribution: number;
  cdiPercentage: number;
  startDate: string;
  endDate: string;
  status: "draft" | "sent" | "approved";
};

export type MonthlyResult = {
  month: string;
  opening: number;
  income: number;
  closing: number;
  cdi: number;
  grossRate: number;
};

export type SimulationResult = {
  grossBalance: number;
  grossIncome: number;
  incomeTax: number;
  netIncome: number;
  netBalance: number;
  grossRate: number;
  annualizedGrossRate: number;
  netRate: number;
  taxRate: number;
  businessDays: number;
  elapsedDays: number;
  monthly: MonthlyResult[];
};

export type SubscriptionProjectionInput = {
  subscriptionId: string;
  currentValue: number;
  cdiPercentage: number;
  firstDate?: string;
};

export type PortfolioSimulationInput = {
  id: string;
  clientId: string;
  title: string;
  existingSubscriptions: SubscriptionProjectionInput[];
  additionalContribution: number;
  additionalContributionCdiPercentage: number;
  startDate: string;
  endDate: string;
  status: "draft" | "sent" | "approved";
};

export type SubscriptionProjectionResult = {
  subscriptionId: string;
  opening: number;
  cdiPercentage: number;
  grossBalance: number;
  grossIncome: number;
};

export type PortfolioSimulationResult = SimulationResult & {
  existingSubscriptions: SubscriptionProjectionResult[];
  existingGrossBalance: number;
  existingGrossIncome: number;
  additionalContributionGrossBalance: number;
  additionalContributionGrossIncome: number;
  weightedCdiPercentage: number;
};

export const cdiCurve: RateChange[] = [
  { date: "2026-01-28", label: "2026 - 27 e 28 de jan.", rate: 14.9 },
  { date: "2026-03-18", label: "2026 - 17 e 18 de mar.", rate: 14.65 },
  { date: "2026-04-29", label: "2026 - 28 e 29 de abr.", rate: 14.4 },
  { date: "2026-06-17", label: "2026 - 16 e 17 de jun.", rate: 14.15 },
  { date: "2026-08-05", label: "2026 - 04 e 05 de ago.", rate: 13.9 },
  { date: "2026-09-16", label: "2026 - 15 e 16 de set.", rate: 13.65 },
  { date: "2026-11-04", label: "2026 - 03 e 04 de nov.", rate: 13.65 },
  { date: "2026-12-09", label: "2026 - 08 e 09 de dez.", rate: 13.65 },
  { date: "2027-01-27", label: "2027 - 26 e 27 de jan.", rate: 13.65 },
  { date: "2027-03-17", label: "2027 - 16 e 17 de mar.", rate: 13.65 },
  { date: "2027-04-28", label: "2027 - 27 e 28 de abr.", rate: 13.65 },
  { date: "2027-06-16", label: "2027 - 15 e 16 de jun.", rate: 13.65 },
  { date: "2027-08-04", label: "2027 - 03 e 04 de ago.", rate: 13.65 },
  { date: "2027-09-22", label: "2027 - 21 e 22 de set.", rate: 13.65 },
  { date: "2027-10-27", label: "2027 - 26 e 27 de out.", rate: 13.65 },
  { date: "2027-12-08", label: "2027 - 07 e 08 de dez.", rate: 13.65 }
];

export const cdiCurve2026 = cdiCurve;

const holidays = new Set([
  "2026-01-01",
  "2026-02-16",
  "2026-02-17",
  "2026-04-03",
  "2026-04-21",
  "2026-05-01",
  "2026-06-04",
  "2026-09-07",
  "2026-10-12",
  "2026-11-02",
  "2026-11-20",
  "2026-12-25",
  "2027-01-01",
  "2027-02-08",
  "2027-02-09",
  "2027-03-26",
  "2027-04-21",
  "2027-05-01",
  "2027-05-27",
  "2027-09-07",
  "2027-10-12",
  "2027-11-02",
  "2027-11-15",
  "2027-11-20",
  "2027-12-25"
]);

const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export const simulations: SimulationInput[] = [
  {
    id: "sim_001",
    clientId: "cli_aurora",
    title: "Saldo atual + aporte planejado",
    sourceBalance: 237850.42,
    additionalContribution: 50000,
    cdiPercentage: 160,
    startDate: "2026-06-19",
    endDate: "2026-12-31",
    status: "sent"
  },
  {
    id: "sim_002",
    clientId: "cli_safira",
    title: "Simulação usando saldo disponível",
    sourceBalance: 148220.1,
    additionalContribution: 0,
    cdiPercentage: 155,
    startDate: "2026-06-19",
    endDate: "2026-11-30",
    status: "draft"
  },
  {
    id: "sim_003",
    clientId: "cli_monteverde",
    title: "Saldo oficial + novo caixa safra",
    sourceBalance: 512430.78,
    additionalContribution: 120000,
    cdiPercentage: 162,
    startDate: "2026-07-01",
    endDate: "2026-12-31",
    status: "approved"
  }
];

function parseDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

function parseIsoDateParts(value: string) {
  const [yearValue, monthValue, dayValue] = value.split("-");
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);

  if (!year || !month || !day) return undefined;
  return { year, month, day: Math.min(day, 30) };
}

export function commercialMonthsInPeriod(startDate: string, endDate: string) {
  const start = parseIsoDateParts(startDate);
  const end = parseIsoDateParts(endDate);

  if (!start || !end) return 1;

  const commercialDays =
    (end.year - start.year) * 360 +
    (end.month - start.month) * 30 +
    (end.day - start.day) +
    1;

  return Math.max(commercialDays / 30, 1 / 30);
}

export function averageMonthlyRateInPeriod(grossRate: number, startDate: string, endDate: string) {
  const months = commercialMonthsInPeriod(startDate, endDate);
  return Math.pow(1 + grossRate, 1 / months) - 1;
}

function isoDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function isBusinessDay(date: Date) {
  const day = date.getDay();
  return day !== 0 && day !== 6 && !holidays.has(isoDate(date));
}

function incomeTaxRate(days: number) {
  if (days <= 180) return 0.225;
  if (days <= 360) return 0.2;
  if (days <= 720) return 0.175;
  return 0.15;
}

function elapsedCalendarDays(start: Date, end: Date) {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
}

function rateAtDate(date: Date, cdiChanges: RateChange[]) {
  const dateKey = isoDate(date);
  let currentRate = cdiChanges[0]?.rate ?? 0;
  for (const change of cdiChanges) {
    if (change.date <= dateKey) currentRate = change.rate;
  }
  return currentRate;
}

function projectAmount(
  amount: number,
  cdiPercentage: number,
  start: Date,
  end: Date,
  cdiChanges: RateChange[]
) {
  let balance = amount;
  let businessDays = 0;
  const cursor = new Date(start);

  while (cursor <= end) {
    if (isBusinessDay(cursor)) {
      const annualCdi = rateAtDate(cursor, cdiChanges);
      const dailyCdi = Math.pow(1 + annualCdi / 100, 1 / 252) - 1;
      balance += balance * dailyCdi * (cdiPercentage / 100);
      businessDays += 1;
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return {
    balance,
    income: balance - amount,
    businessDays
  };
}

export function weightedAverageCdiPercentage(subscriptions: SubscriptionProjectionInput[]) {
  const activeSubscriptions = subscriptions.filter(subscription => subscription.currentValue > 0);
  const totalValue = activeSubscriptions.reduce((sum, subscription) => sum + subscription.currentValue, 0);

  if (totalValue <= 0) return 0;

  return (
    activeSubscriptions.reduce(
      (sum, subscription) => sum + subscription.currentValue * subscription.cdiPercentage,
      0
    ) / totalValue
  );
}

export function simulateInvestment(input: SimulationInput, cdiChanges = cdiCurve): SimulationResult {
  const start = parseDate(input.startDate);
  const end = parseDate(input.endDate);
  const initialAmount = input.sourceBalance + input.additionalContribution;
  let balance = initialAmount;
  let businessDays = 0;
  let cursor = new Date(start);
  let currentMonth = cursor.getMonth();
  let monthOpening = balance;
  let monthIncome = 0;
  const monthly: MonthlyResult[] = [];

  function rateAt(date: Date) {
    const dateKey = isoDate(date);
    let currentRate = cdiChanges[0]?.rate ?? 0;
    for (const change of cdiChanges) {
      if (change.date <= dateKey) currentRate = change.rate;
    }
    return currentRate;
  }

  while (cursor <= end) {
    const month = cursor.getMonth();
    if (month !== currentMonth) {
      monthly.push({
        month: months[currentMonth]!,
        opening: monthOpening,
        income: monthIncome,
        closing: balance,
        cdi: rateAt(new Date(cursor.getFullYear(), currentMonth + 1, 0, 12)),
        grossRate: monthOpening > 0 ? monthIncome / monthOpening : 0
      });
      currentMonth = month;
      monthOpening = balance;
      monthIncome = 0;
    }

    if (isBusinessDay(cursor)) {
      const annualCdi = rateAt(cursor);
      const dailyCdi = Math.pow(1 + annualCdi / 100, 1 / 252) - 1;
      const income = balance * dailyCdi * (input.cdiPercentage / 100);
      balance += income;
      monthIncome += income;
      businessDays += 1;
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  monthly.push({
    month: months[currentMonth]!,
    opening: monthOpening,
    income: monthIncome,
    closing: balance,
    cdi: rateAt(end),
    grossRate: monthOpening > 0 ? monthIncome / monthOpening : 0
  });

  const elapsedDays = elapsedCalendarDays(start, end);
  const grossIncome = balance - initialAmount;
  const taxRate = incomeTaxRate(elapsedDays);
  const incomeTax = grossIncome * taxRate;
  const netIncome = grossIncome - incomeTax;
  const grossRate = initialAmount > 0 ? grossIncome / initialAmount : 0;
  const netRate = initialAmount > 0 ? netIncome / initialAmount : 0;

  return {
    grossBalance: balance,
    grossIncome,
    incomeTax,
    netIncome,
    netBalance: balance - incomeTax,
    grossRate,
    annualizedGrossRate: initialAmount > 0 ? Math.pow(1 + grossRate, 365 / elapsedDays) - 1 : 0,
    netRate,
    taxRate,
    businessDays,
    elapsedDays,
    monthly
  };
}

export function simulatePortfolioInvestment(
  input: PortfolioSimulationInput,
  cdiChanges = cdiCurve
): PortfolioSimulationResult {
  const start = parseDate(input.startDate);
  const end = parseDate(input.endDate);
  const activeSubscriptions = input.existingSubscriptions.filter(subscription => subscription.currentValue > 0);
  const initialExistingAmount = activeSubscriptions.reduce((sum, subscription) => sum + subscription.currentValue, 0);
  const initialAmount = initialExistingAmount + input.additionalContribution;
  const weightedCdiPercentage =
    initialAmount > 0
      ? (activeSubscriptions.reduce(
          (sum, subscription) => sum + subscription.currentValue * subscription.cdiPercentage,
          input.additionalContribution * input.additionalContributionCdiPercentage
        ) /
          initialAmount)
      : 0;
  const elapsedDays = elapsedCalendarDays(start, end);

  const existingSubscriptions = activeSubscriptions.map(subscription => {
    const projected = projectAmount(subscription.currentValue, subscription.cdiPercentage, start, end, cdiChanges);
    const taxStart = subscription.firstDate ? parseDate(subscription.firstDate) : start;
    const taxDays = elapsedCalendarDays(taxStart, end);

    return {
      subscriptionId: subscription.subscriptionId,
      opening: subscription.currentValue,
      cdiPercentage: subscription.cdiPercentage,
      grossBalance: projected.balance,
      grossIncome: projected.income,
      incomeTax: projected.income * incomeTaxRate(taxDays),
      taxRate: incomeTaxRate(taxDays)
    };
  });

  const contributionProjection = projectAmount(
    input.additionalContribution,
    input.additionalContributionCdiPercentage,
    start,
    end,
    cdiChanges
  );

  const existingGrossBalance = existingSubscriptions.reduce((sum, subscription) => sum + subscription.grossBalance, 0);
  const existingGrossIncome = existingSubscriptions.reduce((sum, subscription) => sum + subscription.grossIncome, 0);
  const grossBalance = existingGrossBalance + contributionProjection.balance;
  const grossIncome = existingGrossIncome + contributionProjection.income;
  const contributionIncomeTax = contributionProjection.income * incomeTaxRate(elapsedDays);
  const existingIncomeTax = existingSubscriptions.reduce((sum, subscription) => sum + subscription.incomeTax, 0);
  const incomeTax = existingIncomeTax + contributionIncomeTax;
  const taxRate = grossIncome > 0 ? incomeTax / grossIncome : 0;
  const netIncome = grossIncome - incomeTax;

  const monthlyInput: SimulationInput = {
    id: input.id,
    clientId: input.clientId,
    title: input.title,
    sourceBalance: initialExistingAmount,
    additionalContribution: input.additionalContribution,
    cdiPercentage: weightedCdiPercentage,
    startDate: input.startDate,
    endDate: input.endDate,
    status: input.status
  };
  const monthlyApproximation = simulateInvestment(monthlyInput, cdiChanges).monthly;

  return {
    grossBalance,
    grossIncome,
    incomeTax,
    netIncome,
    netBalance: grossBalance - incomeTax,
    grossRate: initialAmount > 0 ? grossIncome / initialAmount : 0,
    annualizedGrossRate: initialAmount > 0 ? Math.pow(1 + grossIncome / initialAmount, 365 / elapsedDays) - 1 : 0,
    netRate: initialAmount > 0 ? netIncome / initialAmount : 0,
    taxRate,
    businessDays: projectAmount(1, 100, start, end, cdiChanges).businessDays,
    elapsedDays,
    monthly: monthlyApproximation,
    existingSubscriptions,
    existingGrossBalance,
    existingGrossIncome,
    additionalContributionGrossBalance: contributionProjection.balance,
    additionalContributionGrossIncome: contributionProjection.income,
    weightedCdiPercentage
  };
}
