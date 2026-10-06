export type Money = number;

export type RedemptionPreviousWithdrawal = {
  id: string;
  date: string;
  grossAmount: Money;
  principalReturned: Money;
  accruedIncomeRedeemed: Money;
  incomeTax: Money;
};

export type RedemptionSubscriptionInput = {
  id: string;
  applicationDate: string;
  remainingPrincipal: Money;
  currentGrossBalance: Money;
  individualTaxRate: number;
  previousWithdrawals?: RedemptionPreviousWithdrawal[];
};

export type RedemptionSimulationInput = {
  id: string;
  clientId?: string;
  clientName: string;
  positionDate: string;
  redemptionDate: string;
  requestedGrossAmount: Money;
  subscriptions: RedemptionSubscriptionInput[];
  source: "gms-base" | "manual";
};

export type RedemptionSubscriptionAllocation = {
  subscriptionId: string;
  applicationDate: string;
  openingPrincipal: Money;
  openingGrossBalance: Money;
  accruedIncomeBeforeRedemption: Money;
  incomeShareBeforeRedemption: number;
  individualTaxRate: number;
  grossWithdrawal: Money;
  accruedIncomeRedeemed: Money;
  principalReturned: Money;
  incomeTax: Money;
  netAmount: Money;
  remainingPrincipal: Money;
  remainingGrossBalance: Money;
};

export type RedemptionSimulationResult = {
  ok: true;
  inputId: string;
  clientId?: string;
  clientName: string;
  positionDate: string;
  redemptionDate: string;
  requestedGrossAmount: Money;
  totalGrossWithdrawal: Money;
  totalPrincipalReturned: Money;
  totalAccruedIncomeRedeemed: Money;
  totalIncomeTax: Money;
  totalNetAmount: Money;
  allocations: RedemptionSubscriptionAllocation[];
  untouchedSubscriptions: string[];
  projectedSubscriptions: Array<{
    subscriptionId: string;
    remainingPrincipal: Money;
    remainingGrossBalance: Money;
  }>;
};

const moneyScale = 100;

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * moneyScale) / moneyScale;
}

function assertFiniteMoney(value: number, field: string) {
  if (!Number.isFinite(value)) throw new Error(`${field} must be a finite number.`);
}

function assertNonNegativeMoney(value: number, field: string) {
  assertFiniteMoney(value, field);
  if (value < 0) throw new Error(`${field} cannot be negative.`);
}

function assertDate(value: string, field: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T12:00:00`).getTime())) {
    throw new Error(`${field} must be an ISO date in yyyy-mm-dd format.`);
  }
}

function validateSubscription(subscription: RedemptionSubscriptionInput) {
  if (!subscription.id.trim()) throw new Error("subscription.id is required.");
  assertDate(subscription.applicationDate, `subscription ${subscription.id} applicationDate`);
  assertNonNegativeMoney(subscription.remainingPrincipal, `subscription ${subscription.id} remainingPrincipal`);
  assertNonNegativeMoney(subscription.currentGrossBalance, `subscription ${subscription.id} currentGrossBalance`);
  assertFiniteMoney(subscription.individualTaxRate, `subscription ${subscription.id} individualTaxRate`);

  if (subscription.individualTaxRate < 0 || subscription.individualTaxRate > 1) {
    throw new Error(`subscription ${subscription.id} individualTaxRate must be between 0 and 1.`);
  }

  if (roundMoney(subscription.remainingPrincipal) > roundMoney(subscription.currentGrossBalance)) {
    throw new Error(`subscription ${subscription.id} remainingPrincipal cannot exceed currentGrossBalance.`);
  }

  for (const previousWithdrawal of subscription.previousWithdrawals ?? []) {
    if (!previousWithdrawal.id.trim()) throw new Error(`subscription ${subscription.id} previous withdrawal id is required.`);
    assertDate(previousWithdrawal.date, `subscription ${subscription.id} previous withdrawal date`);
    assertNonNegativeMoney(previousWithdrawal.grossAmount, `subscription ${subscription.id} previous withdrawal grossAmount`);
    assertNonNegativeMoney(previousWithdrawal.principalReturned, `subscription ${subscription.id} previous withdrawal principalReturned`);
    assertNonNegativeMoney(
      previousWithdrawal.accruedIncomeRedeemed,
      `subscription ${subscription.id} previous withdrawal accruedIncomeRedeemed`
    );
    assertNonNegativeMoney(previousWithdrawal.incomeTax, `subscription ${subscription.id} previous withdrawal incomeTax`);
  }
}

function validateInput(input: RedemptionSimulationInput) {
  if (!input.id.trim()) throw new Error("id is required.");
  if (!input.clientName.trim()) throw new Error("clientName is required.");
  assertDate(input.positionDate, "positionDate");
  assertDate(input.redemptionDate, "redemptionDate");
  assertNonNegativeMoney(input.requestedGrossAmount, "requestedGrossAmount");
  if (input.requestedGrossAmount <= 0) throw new Error("requestedGrossAmount must be greater than zero.");
  if (!input.subscriptions.length) throw new Error("At least one subscription is required.");

  for (const subscription of input.subscriptions) validateSubscription(subscription);
}

export function simulateRedemption(input: RedemptionSimulationInput): RedemptionSimulationResult {
  validateInput(input);

  const orderedSubscriptions = [...input.subscriptions].sort((first, second) => {
    const dateOrder = first.applicationDate.localeCompare(second.applicationDate);
    return dateOrder !== 0 ? dateOrder : first.id.localeCompare(second.id);
  });
  const totalAvailable = roundMoney(
    orderedSubscriptions.reduce((sum, subscription) => sum + roundMoney(subscription.currentGrossBalance), 0)
  );
  const requestedGrossAmount = roundMoney(input.requestedGrossAmount);

  if (requestedGrossAmount > totalAvailable) {
    throw new Error(`Insufficient balance. Requested ${requestedGrossAmount}, available ${totalAvailable}.`);
  }

  let remainingRequest = requestedGrossAmount;
  const allocations: RedemptionSubscriptionAllocation[] = [];
  const projectedSubscriptions: RedemptionSimulationResult["projectedSubscriptions"] = [];

  for (const subscription of orderedSubscriptions) {
    const openingGrossBalance = roundMoney(subscription.currentGrossBalance);
    const openingPrincipal = roundMoney(subscription.remainingPrincipal);

    if (openingGrossBalance <= 0) {
      projectedSubscriptions.push({
        subscriptionId: subscription.id,
        remainingPrincipal: openingPrincipal,
        remainingGrossBalance: openingGrossBalance
      });
      continue;
    }

    const grossWithdrawal = roundMoney(Math.min(remainingRequest, openingGrossBalance));
    const accruedIncomeBeforeRedemption = roundMoney(openingGrossBalance - openingPrincipal);
    const incomeShareBeforeRedemption = openingGrossBalance > 0 ? accruedIncomeBeforeRedemption / openingGrossBalance : 0;
    const accruedIncomeRedeemed = roundMoney(grossWithdrawal * incomeShareBeforeRedemption);
    const principalReturned = roundMoney(grossWithdrawal - accruedIncomeRedeemed);
    const incomeTax = roundMoney(accruedIncomeRedeemed * subscription.individualTaxRate);
    const netAmount = roundMoney(grossWithdrawal - incomeTax);
    const remainingPrincipal = roundMoney(openingPrincipal - principalReturned);
    const remainingGrossBalance = roundMoney(openingGrossBalance - grossWithdrawal);

    if (grossWithdrawal > 0) {
      allocations.push({
        subscriptionId: subscription.id,
        applicationDate: subscription.applicationDate,
        openingPrincipal,
        openingGrossBalance,
        accruedIncomeBeforeRedemption,
        incomeShareBeforeRedemption,
        individualTaxRate: subscription.individualTaxRate,
        grossWithdrawal,
        accruedIncomeRedeemed,
        principalReturned,
        incomeTax,
        netAmount,
        remainingPrincipal,
        remainingGrossBalance
      });
    }

    projectedSubscriptions.push({
      subscriptionId: subscription.id,
      remainingPrincipal,
      remainingGrossBalance
    });
    remainingRequest = roundMoney(remainingRequest - grossWithdrawal);
    if (remainingRequest <= 0) {
      for (const untouched of orderedSubscriptions.slice(orderedSubscriptions.indexOf(subscription) + 1)) {
        projectedSubscriptions.push({
          subscriptionId: untouched.id,
          remainingPrincipal: roundMoney(untouched.remainingPrincipal),
          remainingGrossBalance: roundMoney(untouched.currentGrossBalance)
        });
      }
      break;
    }
  }

  const totalGrossWithdrawal = roundMoney(allocations.reduce((sum, allocation) => sum + allocation.grossWithdrawal, 0));
  const totalPrincipalReturned = roundMoney(allocations.reduce((sum, allocation) => sum + allocation.principalReturned, 0));
  const totalAccruedIncomeRedeemed = roundMoney(
    allocations.reduce((sum, allocation) => sum + allocation.accruedIncomeRedeemed, 0)
  );
  const totalIncomeTax = roundMoney(allocations.reduce((sum, allocation) => sum + allocation.incomeTax, 0));
  const totalNetAmount = roundMoney(totalGrossWithdrawal - totalIncomeTax);
  const touchedSubscriptionIds = new Set(allocations.map(allocation => allocation.subscriptionId));

  return {
    ok: true,
    inputId: input.id,
    clientId: input.clientId,
    clientName: input.clientName,
    positionDate: input.positionDate,
    redemptionDate: input.redemptionDate,
    requestedGrossAmount,
    totalGrossWithdrawal,
    totalPrincipalReturned,
    totalAccruedIncomeRedeemed,
    totalIncomeTax,
    totalNetAmount,
    allocations,
    untouchedSubscriptions: orderedSubscriptions
      .filter(subscription => !touchedSubscriptionIds.has(subscription.id))
      .map(subscription => subscription.id),
    projectedSubscriptions
  };
}
