import { NextResponse } from "next/server";
import { readGeneralInvestorSubscriptionStore } from "@/src/integrations/general-investor-subscription-store";
import { readInvestorSubscriptionStore } from "@/src/integrations/investor-subscription-store";
import { readLatestCustodyMovementSummary } from "@/src/integrations/custody-movement-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Subscription = {
  currentValue?: number;
  isRedeemed?: boolean;
};

type Account = {
  accountCode?: string;
  clientName?: string;
  totalCurrentValue?: number;
  subscriptions?: Subscription[];
};

type SubscriptionStore = {
  syncedAt?: string;
  positionDate?: string;
  accounts?: Record<string, Account>;
};

function unauthorized(request: Request) {
  const validSecrets = [
    process.env.CRM_CUSTODY_SYNC_SECRET,
    process.env.CRM_INTEGRATION_TOKEN,
    process.env.GMS_SYNC_SECRET
  ].filter(Boolean);
  const providedSecret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();

  return !providedSecret || !validSecrets.includes(providedSecret);
}

function summarizeStore(store?: SubscriptionStore) {
  const accounts = Object.values(store?.accounts ?? {});

  return accounts.reduce(
    (summary, account) => {
      const subscriptions = account.subscriptions ?? [];
      const activeValue = subscriptions.reduce((sum, subscription) => {
        if (subscription.isRedeemed) return sum;
        return sum + Number(subscription.currentValue ?? 0);
      }, 0);
      const totalCurrentValue = Number(account.totalCurrentValue ?? 0);
      const balance = activeValue || totalCurrentValue;

      if (balance > 0) {
        summary.clientCount += 1;
        summary.custody += balance;
      }

      return summary;
    },
    { clientCount: 0, custody: 0 }
  );
}

function listAccounts(store?: SubscriptionStore, clientSegment?: string | null) {
  return Object.entries(store?.accounts ?? {})
    .map(([key, account]) => {
      const subscriptions = account.subscriptions ?? [];
      const activeValue = subscriptions.reduce((sum, subscription) => {
        if (subscription.isRedeemed) return sum;
        return sum + Number(subscription.currentValue ?? 0);
      }, 0);
      const totalCurrentValue = Number(account.totalCurrentValue ?? 0);
      const balance = activeValue || totalCurrentValue;

      return {
        accountCode: String(account.accountCode ?? key).replace(/^code:/i, ""),
        clientName: String(account.clientName ?? "").trim(),
        totalCurrentValue: balance,
        clientSegment
      };
    })
    .filter((account) => account.accountCode && account.clientName && account.totalCurrentValue > 0);
}

function referenceMonthFromStore(generalStore?: SubscriptionStore, bonaStore?: SubscriptionStore) {
  const value = generalStore?.positionDate || generalStore?.syncedAt || bonaStore?.positionDate || bonaStore?.syncedAt;
  if (!value) return new Date().toISOString().slice(0, 7);

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 7);

  return date.toISOString().slice(0, 7);
}

export async function GET(request: Request) {
  if (unauthorized(request)) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const [generalStore, bonaStore, movements] = await Promise.all([
    readGeneralInvestorSubscriptionStore(),
    readInvestorSubscriptionStore().catch(() => undefined),
    readLatestCustodyMovementSummary().catch(() => undefined)
  ]);

  const generalSummary = summarizeStore(generalStore);
  const bonaSummary = summarizeStore(bonaStore);
  const generalAccounts = listAccounts(generalStore);
  const bonaAccounts = listAccounts(bonaStore, "Cliente Bona");
  const referenceMonth = referenceMonthFromStore(generalStore, bonaStore);
  const currentMovements = movements?.referenceMonth === referenceMonth ? movements : undefined;

  return NextResponse.json({
    ok: true,
    source: "SIMULATOR_API",
    syncedAt: generalStore?.syncedAt || bonaStore?.syncedAt || null,
    positionDate: generalStore?.positionDate || bonaStore?.positionDate || null,
    referenceMonth,
    totalCustody: generalSummary.custody,
    bonaCustody: bonaSummary.custody,
    clientCount: generalSummary.clientCount,
    generalClientCount: generalSummary.clientCount,
    bonaClientCount: bonaSummary.clientCount,
    inflows: currentMovements?.inflows ?? 0,
    redemptions: currentMovements?.redemptions ?? 0,
    bonaInflows: currentMovements?.bonaInflows ?? 0,
    bonaRedemptions: currentMovements?.bonaRedemptions ?? 0,
    movements: currentMovements ?? null,
    accounts: generalAccounts,
    bonaAccounts
  });
}
