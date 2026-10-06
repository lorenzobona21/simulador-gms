export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAllowedCrmUrl(value: string) {
  try {
    const url = new URL(value);
    const configuredAdminUrl = process.env.CRM_ADMIN_URL;

    if (configuredAdminUrl && url.origin === new URL(configuredAdminUrl).origin) {
      return true;
    }

    return url.hostname === "gms-crm-admin.vercel.app" || url.hostname === "localhost";
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const token = process.env.CRM_INTEGRATION_TOKEN;

  if (!token) {
    return Response.json({ message: "CRM integration token is not configured." }, { status: 500 });
  }

  const payload = await request.json();
  const crmReturnUrl = String(payload.crmReturnUrl ?? "").trim();

  if (!crmReturnUrl || !isAllowedCrmUrl(crmReturnUrl)) {
    return Response.json({ message: "CRM return URL is invalid." }, { status: 400 });
  }

  const response = await fetch(crmReturnUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-gms-integration-token": token
    },
    body: JSON.stringify(payload),
    cache: "no-store"
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    return Response.json({ message: result.message ?? "CRM refused the simulation." }, { status: response.status });
  }

  return Response.json(result);
}
