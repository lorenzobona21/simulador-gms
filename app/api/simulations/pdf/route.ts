import { createSimulationPdf, type SimulationPdfPayload } from "@/src/integrations/simulation-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function safeFilename(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export async function POST(request: Request) {
  const payload = (await request.json()) as SimulationPdfPayload;
  const pdf = await createSimulationPdf(payload);
  const filename = `simulacao-gms-${payload.accountCode}-${safeFilename(payload.clientName)}.pdf`;

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store"
    }
  });
}
