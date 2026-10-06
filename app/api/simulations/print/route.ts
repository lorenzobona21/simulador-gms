import { buildSimulationPdfHtml, type SimulationPdfPayload } from "@/src/integrations/simulation-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function withAutoPrint(html: string) {
  const script = `
    <script>
      window.addEventListener("load", async () => {
        try {
          if (document.fonts && document.fonts.ready) await document.fonts.ready;
        } catch (_) {}
        setTimeout(() => window.print(), 350);
      });
    </script>
  `;

  return html.replace("</body>", `${script}</body>`);
}

export async function POST(request: Request) {
  const payload = (await request.json()) as SimulationPdfPayload;
  const html = withAutoPrint(buildSimulationPdfHtml(payload));

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
