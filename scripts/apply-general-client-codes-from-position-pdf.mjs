import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const positionPdfPath = process.argv[2];
const storePath = resolve("work", "latest-general-investor-subscriptions.json");
const snapshotPath = resolve("data", "latest-general-investor-subscriptions.json");

if (!positionPdfPath) {
  console.error("Uso: node scripts/apply-general-client-codes-from-position-pdf.mjs <posicao-debentures.pdf>");
  process.exit(2);
}

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function normalizeClientCode(value) {
  return String(value ?? "").replace(/\D/g, "").replace(/^0+/, "") || "";
}

async function extractPdfItems(pdfPath) {
  class SimpleDOMMatrix {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;

    constructor(init) {
      if (Array.isArray(init) || ArrayBuffer.isView(init)) {
        this.a = Number(init[0] ?? 1);
        this.b = Number(init[1] ?? 0);
        this.c = Number(init[2] ?? 0);
        this.d = Number(init[3] ?? 1);
        this.e = Number(init[4] ?? 0);
        this.f = Number(init[5] ?? 0);
      }
    }

    multiply() {
      return this;
    }

    translate() {
      return this;
    }

    scale() {
      return this;
    }

    rotate() {
      return this;
    }

    inverse() {
      return this;
    }

    transformPoint(point) {
      return point;
    }
  }

  globalThis.DOMMatrix ||= SimpleDOMMatrix;
  globalThis.ImageData ||= class ImageData {
    constructor(data, width, height) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  };
  globalThis.Path2D ||= class Path2D {};

  const pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  globalThis.pdfjsWorker = pdfjsWorker;
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await readFile(pdfPath));
  const document = await pdfjs.getDocument({
    data,
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true
  }).promise;
  const items = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    for (const item of content.items) {
      const text = item.str?.trim();
      if (!text) continue;
      items.push({
        page: pageNumber,
        text,
        x: Number(item.transform?.[4] ?? 0),
        y: Number(item.transform?.[5] ?? 0)
      });
    }
  }

  await document.destroy();
  return items;
}

function buildCodeFragments(items) {
  const fragmentsByCode = new Map();

  for (const item of items) {
    const match = /^\((\d+)\)\s+(.+)$/.exec(item.text);
    if (!match) continue;
    const code = normalizeClientCode(match[1]);
    const fragment = normalizeName(match[2]);
    if (!code || !fragment) continue;

    const fragments = fragmentsByCode.get(code) ?? new Set();
    fragments.add(fragment);
    fragmentsByCode.set(code, fragments);
  }

  return [...fragmentsByCode.entries()].map(([code, fragments]) => ({
    code,
    fragments: [...fragments].sort((left, right) => right.length - left.length)
  }));
}

function findUniqueCode(clientName, codeFragments) {
  const normalizedClientName = normalizeName(clientName);
  const matches = [];

  for (const { code, fragments } of codeFragments) {
    if (fragments.some(fragment => normalizedClientName.startsWith(fragment) || fragment.startsWith(normalizedClientName))) {
      matches.push(code);
    }
  }

  return new Set(matches).size === 1 ? matches[0] : undefined;
}

const [store, items] = await Promise.all([
  readFile(storePath, "utf8").then(contents => JSON.parse(contents)),
  extractPdfItems(resolve(positionPdfPath))
]);

const codeFragments = buildCodeFragments(items);
const updatedAccounts = {};
const matched = [];
const unmatched = [];

for (const [key, account] of Object.entries(store.accounts ?? {})) {
  const normalizedExistingCode = normalizeClientCode(account.accountCode);
  const currentCode = normalizedExistingCode.length <= 4 ? normalizedExistingCode : "";
  const matchedCode = currentCode || findUniqueCode(account.clientName, codeFragments);
  const nextKey = matchedCode ? `code:${matchedCode}` : key;
  const nextAccount = {
    ...account,
    accountCode: matchedCode || account.accountCode,
    subscriptions: account.subscriptions.map(subscription => ({
      ...subscription,
      accountCode: matchedCode || subscription.accountCode
    }))
  };

  if (matchedCode) {
    matched.push({
      accountCode: matchedCode,
      clientName: account.clientName
    });
  } else {
    unmatched.push(account.clientName);
  }

  if (updatedAccounts[nextKey]) {
    updatedAccounts[nextKey].totalCurrentValue += nextAccount.totalCurrentValue;
    updatedAccounts[nextKey].subscriptions.push(...nextAccount.subscriptions);
  } else {
    updatedAccounts[nextKey] = nextAccount;
  }
}

const updatedStore = {
  ...store,
  accounts: Object.fromEntries(
    Object.entries(updatedAccounts).sort(([, left], [, right]) => left.clientName.localeCompare(right.clientName, "pt-BR"))
  )
};

await writeFile(storePath, JSON.stringify(updatedStore, null, 2), "utf8");
await mkdir(dirname(snapshotPath), { recursive: true });
await writeFile(snapshotPath, JSON.stringify(updatedStore, null, 2), "utf8");

console.log(
  JSON.stringify(
    {
      ok: true,
      positionRowsWithCodes: codeFragments.length,
      matched: matched.length,
      unmatched: unmatched.length,
      sampleMatched: matched.slice(0, 10),
      sampleUnmatched: unmatched.slice(0, 10)
    },
    null,
    2
  )
);
