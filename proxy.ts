import { NextResponse, type NextRequest } from "next/server";
import { basicAuthCredentialsFromEnv, matchesBasicAuth } from "./src/auth/basic-auth";

function unauthorized() {
  return new NextResponse("Autenticacao necessaria.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="GMS"',
      "Cache-Control": "no-store"
    }
  });
}

function hasValidBasicAuth(request: NextRequest) {
  const credentials = basicAuthCredentialsFromEnv(process.env);
  const expectedSyncSecret = process.env.CRM_CUSTODY_SYNC_SECRET || process.env.CRM_INTEGRATION_TOKEN;

  if (request.nextUrl.pathname === "/api/sync/monthly-detailed-subscriptions" && expectedSyncSecret) {
    const providedSecret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
    if (providedSecret === expectedSyncSecret) return true;
  }

  if (credentials.length === 0) return process.env.VERCEL !== "1";

  return matchesBasicAuth(request.headers.get("authorization"), credentials);
}

export function proxy(request: NextRequest) {
  if (!hasValidBasicAuth(request)) return unauthorized();
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/|fonts/).*)"]
};
