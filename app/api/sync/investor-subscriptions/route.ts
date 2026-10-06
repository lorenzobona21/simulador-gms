import { NextResponse } from "next/server";
import { fetchNetfactorInvestorSubscriptions } from "@/src/integrations/investor-subscription-source";
import { saveInvestorSubscriptionSummary } from "@/src/integrations/investor-subscription-store";
import { isAllowedClientCode } from "@/src/domain/client-allowlist";

export const runtime = "nodejs";
export const maxDuration = 300;

function unauthorized(request: Request) {
  const expectedSecret = process.env.GMS_SYNC_SECRET;
  const providedSecret = request.headers.get("authorization")?.replace("Bearer ", "");

  return expectedSecret && providedSecret !== expectedSecret;
}

async function readPayload(request: Request) {
  if (request.method === "GET") {
    const url = new URL(request.url);
    return {
      accountCode: url.searchParams.get("accountCode") ?? "",
      investorName: url.searchParams.get("investorName") ?? ""
    };
  }

  return (await request.json().catch(() => ({}))) as { accountCode?: string; investorName?: string };
}

async function syncInvestorSubscriptions(request: Request) {
  if (unauthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await readPayload(request);
  const accountCode = payload.accountCode?.trim();
  const investorName = payload.investorName?.trim();

  if (!accountCode || !investorName) {
    return NextResponse.json(
      { ok: false, error: "accountCode and investorName are required." },
      { status: 400 }
    );
  }

  if (!isAllowedClientCode(accountCode)) {
    return NextResponse.json(
      { ok: false, error: `Account ${accountCode} is outside data/my-client-codes.json.` },
      { status: 403 }
    );
  }

  const summary = await fetchNetfactorInvestorSubscriptions({
    accountCode,
    investorName,
    headless: !["0", "false", "no"].includes((process.env.NETFACTOR_HEADLESS || "true").toLowerCase())
  });
  const savedTo = await saveInvestorSubscriptionSummary(summary);

  return NextResponse.json({
    ok: true,
    savedTo,
    accountCode: summary.accountCode,
    clientName: summary.clientName,
    syncedAt: summary.syncedAt,
    subscriptions: summary.subscriptions.length,
    activeSubscriptions: summary.subscriptions.filter(subscription => !subscription.isRedeemed).length,
    totalCurrentValue: summary.totalCurrentValue
  });
}

export async function GET(request: Request) {
  return syncInvestorSubscriptions(request);
}

export async function POST(request: Request) {
  return syncInvestorSubscriptions(request);
}
