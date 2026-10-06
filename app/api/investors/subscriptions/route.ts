import { NextResponse } from "next/server";
import { readInvestorSubscriptionStore } from "@/src/integrations/investor-subscription-store";

export const runtime = "nodejs";

function unauthorized(request: Request) {
  const expectedSecret = process.env.GMS_SYNC_SECRET;
  const providedSecret = request.headers.get("authorization")?.replace("Bearer ", "");

  return expectedSecret && providedSecret !== expectedSecret;
}

export async function GET(request: Request) {
  if (unauthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const accountCode = url.searchParams.get("accountCode");

  try {
    const store = await readInvestorSubscriptionStore();

    if (accountCode) {
      const summary = store.accounts[accountCode];
      if (!summary) {
        return NextResponse.json({ ok: false, error: "No subscriptions found for this account." }, { status: 404 });
      }

      return NextResponse.json({ ok: true, syncedAt: store.syncedAt, account: summary });
    }

    return NextResponse.json({
      ok: true,
      syncedAt: store.syncedAt,
      accounts: Object.values(store.accounts).map(account => ({
        accountCode: account.accountCode,
        clientName: account.clientName,
        syncedAt: account.syncedAt,
        subscriptions: account.subscriptions.length,
        activeSubscriptions: account.subscriptions.filter(subscription => !subscription.isRedeemed).length,
        totalCurrentValue: account.totalCurrentValue
      }))
    });
  } catch {
    return NextResponse.json({ ok: false, error: "No subscription report has been synced yet." }, { status: 404 });
  }
}
