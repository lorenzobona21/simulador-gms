import { existsSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

function loadDotEnvLocal() {
  const envPath = resolve(".env.local");
  if (!existsSync(envPath)) return;

  const contents = readFileSync(envPath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^"|"$/g, "");
    process.env[key] ??= value;
  }
}

async function findLatestMonthlyDetailedPdf() {
  const downloadDir = resolve("work", "netfactor-downloads");
  const files = await readdir(downloadDir, { withFileTypes: true });
  const candidates = await Promise.all(
    files
      .filter(file => file.isFile() && /^netfactor-extrato-mensal-detalhado-base-.*\.pdf$/i.test(file.name))
      .map(async file => {
        const path = join(downloadDir, file.name);
        const stat = await import("node:fs/promises").then(fs => fs.stat(path));
        return { path, mtimeMs: stat.mtimeMs };
      })
  );

  return candidates.sort((left, right) => right.mtimeMs - left.mtimeMs)[0]?.path;
}

loadDotEnvLocal();

const explicitPdfPath = process.argv.slice(2).find(arg => !arg.startsWith("--"));
const pdfPath = explicitPdfPath ? resolve(explicitPdfPath) : await findLatestMonthlyDetailedPdf();
const siteUrl = (process.env.GMS_PUBLIC_SITE_URL || "https://simulador-gms-qgxf.vercel.app").replace(/\/+$/g, "");
const username = process.env.APP_LOGIN_USERNAME;
const password = process.env.APP_LOGIN_PASSWORD;

if (!pdfPath) {
  console.error("[gms] Nenhum PDF de extrato mensal detalhado foi encontrado em work/netfactor-downloads.");
  process.exit(1);
}

if (!username || !password) {
  console.error("[gms] Configure APP_LOGIN_USERNAME e APP_LOGIN_PASSWORD para enviar o PDF ao site publicado.");
  process.exit(1);
}

const bytes = await readFile(pdfPath);
const formData = new FormData();
formData.append("report", new Blob([bytes], { type: "application/pdf" }), basename(pdfPath));

const auth = Buffer.from(`${username}:${password}`, "utf8").toString("base64");
const response = await fetch(`${siteUrl}/api/sync/monthly-detailed-subscriptions`, {
  method: "POST",
  headers: { Authorization: `Basic ${auth}` },
  body: formData
});

const text = await response.text();
let payload;
try {
  payload = JSON.parse(text);
} catch {
  payload = { ok: false, error: text };
}

console.log(JSON.stringify({ siteUrl, pdfPath, ...payload }, null, 2));

if (!response.ok || !payload.ok) {
  process.exit(1);
}
