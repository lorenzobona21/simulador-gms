import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { readRemoteJson, writeRemoteJson } from "./remote-json-store.ts";

type SubscriptionLike = {
  subscriptionId?: string;
  firstDate?: string;
  currentValue?: number;
  originalValue?: number;
  isRedeemed?: boolean;
};

type AccountLike = {
  accountCode?: string;
  subscriptions?: SubscriptionLike[];
};

type SubscriptionStoreLike = {
  accounts?: Record<string, AccountLike>;
};

export type CustodyMovementTotals = {
  inflows: number;
  redemptions: number;
};

export type CustodyMovementSummary = {
  referenceMonth: string;
  positionDate?: string;
  inflows: number;
  redemptions: number;
  bonaInflows: number;
  bonaRedemptions: number;
  calculatedAt: string;
  method: "subscription-diff";
};

const defaultStorePath = join(process.cwd(), "work", "latest-custody-movements.json");
const snapshotStorePath = join(process.cwd(), "data", "latest-custody-movements.json");
const remoteStorePath = "gms/latest-custody-movements.json";

function subscriptionKey(accountCode: string, subscription: SubscriptionLike) {
  return `${accountCode}::${subscription.subscriptionId ?? ""}`;
}

function activeValue(subscription: SubscriptionLike) {
  if (subscription.isRedeemed) return 0;
  return Number(subscription.currentValue ?? 0);
}

function originalValue(subscription: SubscriptionLike) {
  return Number(subscription.originalValue ?? subscription.currentValue ?? 0);
}

function flattenSubscriptions(store?: SubscriptionStoreLike) {
  const entries = new Map<string, SubscriptionLike & { accountCode: string }>();

  for (const [key, account] of Object.entries(store?.accounts ?? {})) {
    const accountCode = String(account.accountCode ?? key).replace(/^code:/i, "");
    for (const subscription of account.subscriptions ?? []) {
      if (!subscription.subscriptionId) continue;
      entries.set(subscriptionKey(accountCode, subscription), { ...subscription, accountCode });
    }
  }

  return entries;
}

export function calculateCustodyMovements(
  previousStore: SubscriptionStoreLike | undefined,
  currentStore: SubscriptionStoreLike | undefined,
  referenceMonth: string
): CustodyMovementTotals {
  if (!previousStore || !currentStore) return { inflows: 0, redemptions: 0 };

  const previous = flattenSubscriptions(previousStore);
  const current = flattenSubscriptions(currentStore);
  let inflows = 0;
  let redemptions = 0;

  for (const [key, subscription] of current.entries()) {
    const currentValue = activeValue(subscription);
    const subscriptionOriginalValue = originalValue(subscription);
    const previousSubscription = previous.get(key);

    if (!previousSubscription) {
      if (subscription.firstDate?.slice(0, 7) === referenceMonth && subscriptionOriginalValue > 0) {
        inflows += subscriptionOriginalValue;
      }
      continue;
    }

    const previousValue = activeValue(previousSubscription);
    const drop = previousValue - currentValue;
    if (drop > 1) redemptions += drop;
  }

  for (const [key, subscription] of previous.entries()) {
    if (!current.has(key)) {
      const previousValue = activeValue(subscription);
      if (previousValue > 1) redemptions += previousValue;
    }
  }

  return {
    inflows: Math.round(inflows * 100) / 100,
    redemptions: Math.round(redemptions * 100) / 100
  };
}

export async function readLatestCustodyMovementSummary(): Promise<CustodyMovementSummary | undefined> {
  const remoteStore = await readRemoteJson<CustodyMovementSummary>(remoteStorePath).catch(() => undefined);
  if (remoteStore) return remoteStore;

  for (const path of [defaultStorePath, snapshotStorePath]) {
    try {
      return JSON.parse(await readFile(path, "utf8")) as CustodyMovementSummary;
    } catch {
      // Try the next store location.
    }
  }

  return undefined;
}

export async function saveLatestCustodyMovementSummary(summary: CustodyMovementSummary) {
  if (process.env.VERCEL === "1") {
    await writeRemoteJson(remoteStorePath, summary);
    return remoteStorePath;
  }

  await mkdir(dirname(defaultStorePath), { recursive: true });
  await writeFile(defaultStorePath, JSON.stringify(summary, null, 2), "utf8");
  return defaultStorePath;
}
