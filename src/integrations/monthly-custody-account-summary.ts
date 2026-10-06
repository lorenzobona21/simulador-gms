export type MonthlyCustodySubscription = {
  firstDate?: string;
  originalValue?: number;
  currentValue?: number;
  rescueValue?: number;
  isRedeemed?: boolean;
};

export type MonthlyCustodyAccount = {
  accountCode?: string;
  clientName?: string;
  totalCurrentValue?: number;
  subscriptions?: MonthlyCustodySubscription[];
};

export function monthlyInflow(account: MonthlyCustodyAccount, referenceMonth: string) {
  return (account.subscriptions ?? []).reduce((sum, subscription) => {
    const originalValue = Number(subscription.originalValue ?? subscription.currentValue ?? 0);
    if (originalValue <= 0 || subscription.firstDate?.slice(0, 7) !== referenceMonth) return sum;
    return sum + originalValue;
  }, 0);
}

export function monthlyRedemptions(account: MonthlyCustodyAccount) {
  return (account.subscriptions ?? []).reduce((sum, subscription) => {
    const rescueValue = Number(subscription.rescueValue ?? 0);
    return rescueValue > 0 ? sum + rescueValue : sum;
  }, 0);
}

export function listMonthlyCustodyAccounts(accounts: MonthlyCustodyAccount[], referenceMonth: string) {
  return accounts
    .map((account) => {
      const monthlyInflowValue = monthlyInflow(account, referenceMonth);
      const monthlyRedemptionsValue = monthlyRedemptions(account);

      return {
        accountCode: String(account.accountCode ?? "").replace(/^code:/i, ""),
        clientName: String(account.clientName ?? "").trim(),
        totalCurrentValue: Number(account.totalCurrentValue ?? 0),
        monthlyInflow: Math.round(monthlyInflowValue * 100) / 100,
        monthlyRedemptions: Math.round(monthlyRedemptionsValue * 100) / 100
      };
    })
    .filter((account) => account.accountCode && account.clientName && (account.totalCurrentValue > 0 || account.monthlyInflow > 0 || account.monthlyRedemptions > 0));
}
