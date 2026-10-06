import { readLatestInvestorReport } from "./investor-report-store.ts";
import {
  readInvestorSubscriptionStore,
  saveInvestorSubscriptionStore,
  type InvestorSubscriptionSummary
} from "./investor-subscription-store.ts";
import { isAllowedClientCode, normalizeClientCode } from "../domain/client-allowlist.ts";

type PdfTextItem = {
  text: string;
  x: number;
  y: number;
};

type ParsedSubscription = {
  accountCode?: string;
  subscriptionId: string;
  cdiPercentage: number;
  latestAnnualIndexRate: number;
  firstDate: string;
  latestDate: string;
  currentValue: number;
  originalValue?: number;
  rescueValue?: number;
  isRedeemed: boolean;
};

type ParsedPage = {
  clientName: string;
  accountCode?: string;
  document?: string;
  subscriptions: ParsedSubscription[];
  totalCurrentValue: number;
};

type ImportOptions = {
  dryRun?: boolean;
  positionDate?: string;
};

export type GeneralInvestorSubscriptionStore = {
  syncedAt: string;
  positionDate?: string;
  accounts: Record<string, InvestorSubscriptionSummary & { document?: string; segment: "general" }>;
};

export type MonthlyDetailedImportResult = {
  ok: true;
  dryRun: boolean;
  pages: number;
  imported: number;
  skipped: number;
  importedAccounts: Array<{
    accountCode: string;
    clientName: string;
    subscriptions: number;
    totalCurrentValue: number;
  }>;
  skippedPages: Array<{
    clientName: string;
    accountCode: string;
    subscriptions: number;
    reason: "client_name_not_matched" | "outside_allowlist" | "no_subscriptions";
  }>;
};

export function normalizeName(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function normalizeDocument(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function parseMoney(value?: string) {
  if (!value) return 0;
  return Number(value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
}

function parsePercent(value?: string) {
  if (!value) return 0;
  return Number(value.replace(/%.*$/g, "").replace(",", "."));
}

function toIsoDate(value?: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value ?? "").trim());
  if (!match) return "";
  return `${match[3]}-${match[2]}-${match[1]}`;
}

async function importModule<T>(specifier: string): Promise<T> {
  const dynamicImport = new Function("specifier", "return import(specifier)");
  return dynamicImport(specifier) as Promise<T>;
}

function ensurePdfJsDomPolyfills() {
  const global = globalThis as Record<string, unknown>;

  class SimpleDOMMatrix {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;

    constructor(init?: number[] | Float32Array | Float64Array) {
      if (Array.isArray(init) || ArrayBuffer.isView(init)) {
        this.a = Number(init[0] ?? 1);
        this.b = Number(init[1] ?? 0);
        this.c = Number(init[2] ?? 0);
        this.d = Number(init[3] ?? 1);
        this.e = Number(init[4] ?? 0);
        this.f = Number(init[5] ?? 0);
      }
    }

    multiply(other: SimpleDOMMatrix) {
      return new SimpleDOMMatrix([
        this.a * other.a + this.c * other.b,
        this.b * other.a + this.d * other.b,
        this.a * other.c + this.c * other.d,
        this.b * other.c + this.d * other.d,
        this.a * other.e + this.c * other.f + this.e,
        this.b * other.e + this.d * other.f + this.f
      ]);
    }

    translate(x = 0, y = 0) {
      return this.multiply(new SimpleDOMMatrix([1, 0, 0, 1, x, y]));
    }

    scale(scaleX = 1, scaleY = scaleX) {
      return this.multiply(new SimpleDOMMatrix([scaleX, 0, 0, scaleY, 0, 0]));
    }
  }

  class SimpleImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;

    constructor(data: Uint8ClampedArray, width: number, height: number) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  }

  class SimplePath2D {}

  global.DOMMatrix ??= SimpleDOMMatrix;
  global.ImageData ??= SimpleImageData;
  global.Path2D ??= SimplePath2D;
}

async function extractPages(pdfData: Uint8Array) {
  ensurePdfJsDomPolyfills();

  const pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  (globalThis as typeof globalThis & { pdfjsWorker?: typeof pdfjsWorker }).pdfjsWorker = pdfjsWorker;

  const pdfjs = process.env.PDFJS_MODULE_PATH
    ? await importModule<{
        getDocument: (options: Record<string, unknown>) => { promise: Promise<unknown> };
        GlobalWorkerOptions?: { workerSrc?: string };
      }>(process.env.PDFJS_MODULE_PATH)
    : await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = "pdfjs-dist/legacy/build/pdf.worker.mjs";
  }
  const document = (await pdfjs.getDocument({
    data: new Uint8Array(pdfData),
    disableWorker: true,
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true
  }).promise) as {
    numPages: number;
    getPage: (pageNumber: number) => Promise<{
      getTextContent: () => Promise<{ items: Array<{ str?: string; transform?: number[] }> }>;
    }>;
    destroy: () => Promise<void>;
  };

  const pages: PdfTextItem[][] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .filter(item => item.str?.trim())
        .map(item => ({
          text: item.str!.trim(),
          x: Number(item.transform?.[4] ?? 0),
          y: Number(item.transform?.[5] ?? 0)
        }))
    );
  }

  await document.destroy();
  return pages;
}

function nearestText(items: PdfTextItem[], x: number, y: number, options: { xTolerance?: number; yTolerance?: number } = {}) {
  const xTolerance = options.xTolerance ?? 20;
  const yTolerance = options.yTolerance ?? 8;
  return items
    .map(item => ({
      item,
      distance: Math.abs(item.x - x) + Math.abs(item.y - y)
    }))
    .filter(candidate => Math.abs(candidate.item.x - x) <= xTolerance && Math.abs(candidate.item.y - y) <= yTolerance)
    .sort((left, right) => left.distance - right.distance)[0]?.item.text;
}

function clientNameFromPage(items: PdfTextItem[]) {
  const candidates = items
    .filter(item => item.x >= 175 && item.x <= 260 && item.y >= 480 && item.y <= 560)
    .map(item => item.text)
    .filter(
      text =>
        /[A-Z]{3}/i.test(text) &&
        !/%\s*CDI/i.test(text) &&
        !/^\d/.test(text) &&
        !/^(Nome|CPF|CNPJ|Dados|Porto Alegre)$/i.test(text)
    );

  return candidates.sort((left, right) => right.length - left.length)[0] ?? "";
}

function clientDocumentFromPage(items: PdfTextItem[]) {
  return normalizeDocument(items.find(item => /^\d{3}\.\d{3}\.\d{3}-\d{2}$|^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(item.text))?.text);
}

function parsePage(
  items: PdfTextItem[],
  nameToCode: Map<string, string>,
  context: { clientName?: string; accountCode?: string; document?: string },
  pageNumber: number
): ParsedPage {
  const explicitClientName = clientNameFromPage(items);
  const explicitDocument = clientDocumentFromPage(items);
  const clientName = explicitClientName || context.clientName || "";
  const accountCode = nameToCode.get(normalizeName(clientName)) ?? context.accountCode;
  const document = explicitDocument || context.document;
  const rateItems = items
    .filter(item => /^\d+(?:[.,]\d+)?%CDI$/i.test(item.text))
    .filter(item => item.x > 20 && item.x < 560)
    .sort((left, right) => left.x - right.x);

  const subscriptions = rateItems
    .map((rateItem, index): ParsedSubscription | undefined => {
      const valueX = rateItem.x + 9;
      const applicationDate = toIsoDate(nearestText(items, valueX, 16, { xTolerance: 16, yTolerance: 12 }));
      const rescueValue = parseMoney(nearestText(items, valueX, 125, { xTolerance: 18, yTolerance: 16 }));
      const currentValue = parseMoney(nearestText(items, valueX, 702, { xTolerance: 18, yTolerance: 16 }));
      const originalValue = parseMoney(nearestText(items, valueX, 247, { xTolerance: 18, yTolerance: 16 }));
      const cdiPercentage = parsePercent(rateItem.text);

      if (!applicationDate || (!currentValue && !originalValue && !rescueValue) || !cdiPercentage) return undefined;

      return {
        accountCode,
        subscriptionId: `mensal-${pageNumber}-${index + 1}-${applicationDate}-${cdiPercentage.toFixed(2)}-${originalValue.toFixed(2)}`,
        cdiPercentage,
        latestAnnualIndexRate: 0,
        firstDate: applicationDate,
        latestDate: new Date().toISOString().slice(0, 10),
        currentValue,
        originalValue,
        rescueValue,
        isRedeemed: currentValue <= 0.005
      };
    })
    .filter((subscription): subscription is ParsedSubscription => Boolean(subscription));

  return {
    clientName,
    accountCode,
    document,
    subscriptions,
    totalCurrentValue: subscriptions.reduce((sum, subscription) => sum + subscription.currentValue, 0)
  };
}

async function buildNameToCodeMap() {
  const nameToCode = new Map<string, string>();

  try {
    const report = await readLatestInvestorReport();
    for (const statement of report.statements ?? []) {
      const accountCode = normalizeClientCode(statement.positions?.[0]?.accountCode);
      if (accountCode && statement.clientName) nameToCode.set(normalizeName(statement.clientName), accountCode);
    }
  } catch {
    // The previous subscription store may still provide enough names.
  }

  try {
    const store = await readInvestorSubscriptionStore();
    for (const [accountCode, summary] of Object.entries(store.accounts ?? {})) {
      if (accountCode && summary.clientName) nameToCode.set(normalizeName(summary.clientName), normalizeClientCode(accountCode));
    }
  } catch {
    // A missing previous store is fine for a first import.
  }

  return nameToCode;
}

export async function importMonthlyDetailedSubscriptionsFromPdfData(
  pdfData: Uint8Array,
  options: ImportOptions = {}
): Promise<MonthlyDetailedImportResult> {
  const dryRun = Boolean(options.dryRun);
  const positionDate = options.positionDate;
  const nameToCode = await buildNameToCodeMap();
  const pages = await extractPages(pdfData);
  const parsedPages: ParsedPage[] = [];
  let currentContext: { clientName?: string; accountCode?: string; document?: string } = {};

  for (const [pageIndex, page] of pages.entries()) {
    const explicitClientName = clientNameFromPage(page);
    const explicitDocument = clientDocumentFromPage(page);
    if (explicitClientName || explicitDocument) {
      currentContext = {
        clientName: explicitClientName || currentContext.clientName,
        accountCode: explicitClientName ? nameToCode.get(normalizeName(explicitClientName)) : currentContext.accountCode,
        document: explicitDocument || currentContext.document
      };
    }

    parsedPages.push(parsePage(page, nameToCode, currentContext, pageIndex + 1));
  }

  const syncedAt = new Date().toISOString();
  const accounts = new Map<string, InvestorSubscriptionSummary>();
  const skipped: MonthlyDetailedImportResult["skippedPages"] = [];

  for (const parsed of parsedPages) {
    const accountCode = normalizeClientCode(parsed.accountCode);
    if (!parsed.clientName || !accountCode || !isAllowedClientCode(accountCode) || !parsed.subscriptions.length) {
      skipped.push({
        clientName: parsed.clientName,
        accountCode,
        subscriptions: parsed.subscriptions.length,
        reason: !accountCode ? "client_name_not_matched" : !isAllowedClientCode(accountCode) ? "outside_allowlist" : "no_subscriptions"
      });
      continue;
    }

    const current = accounts.get(accountCode) ?? {
      accountCode,
      clientName: parsed.clientName,
      syncedAt,
      source: "netfactor-robot",
      totalCurrentValue: 0,
      subscriptions: []
    };

    current.totalCurrentValue += parsed.totalCurrentValue;
    current.subscriptions.push(...parsed.subscriptions.map(subscription => ({ ...subscription, accountCode })));
    accounts.set(accountCode, current);
  }

  const imported: MonthlyDetailedImportResult["importedAccounts"] = [];

  if (!dryRun) {
    await saveInvestorSubscriptionStore({
      syncedAt,
      positionDate,
      accounts: Object.fromEntries(accounts.entries())
    });
  }

  for (const summary of accounts.values()) {
    imported.push({
      accountCode: summary.accountCode,
      clientName: summary.clientName,
      subscriptions: summary.subscriptions.length,
      totalCurrentValue: summary.totalCurrentValue
    });
  }

  return {
    ok: true,
    dryRun,
    pages: pages.length,
    imported: imported.length,
    skipped: skipped.length,
    importedAccounts: imported,
    skippedPages: skipped
  };
}

export async function extractGeneralInvestorSubscriptionsFromPdfData(
  pdfData: Uint8Array,
  options: ImportOptions = {}
): Promise<GeneralInvestorSubscriptionStore> {
  const nameToCode = await buildNameToCodeMap();
  const pages = await extractPages(pdfData);
  const syncedAt = new Date().toISOString();
  const positionDate = options.positionDate;
  const accounts = new Map<string, InvestorSubscriptionSummary & { document?: string; segment: "general" }>();
  let currentContext: { clientName?: string; accountCode?: string; document?: string } = {};

  for (const [pageIndex, page] of pages.entries()) {
    const explicitClientName = clientNameFromPage(page);
    const explicitDocument = clientDocumentFromPage(page);
    if (explicitClientName || explicitDocument) {
      currentContext = {
        clientName: explicitClientName || currentContext.clientName,
        accountCode: explicitClientName ? nameToCode.get(normalizeName(explicitClientName)) : currentContext.accountCode,
        document: explicitDocument || currentContext.document
      };
    }

    const parsed = parsePage(page, nameToCode, currentContext, pageIndex + 1);
    if (!parsed.clientName || !parsed.subscriptions.length) continue;

    const key = parsed.accountCode
      ? `code:${normalizeClientCode(parsed.accountCode)}`
      : parsed.document
        ? `doc:${parsed.document}`
        : `name:${normalizeName(parsed.clientName)}`;

    const current = accounts.get(key) ?? {
      accountCode: parsed.accountCode ? normalizeClientCode(parsed.accountCode) : key,
      clientName: parsed.clientName,
      syncedAt,
      source: "netfactor-robot",
      totalCurrentValue: 0,
      subscriptions: [],
      document: parsed.document,
      segment: "general" as const
    };

    current.totalCurrentValue += parsed.totalCurrentValue;
    current.subscriptions.push(
      ...parsed.subscriptions.map(subscription => ({
        ...subscription,
        accountCode: current.accountCode
      }))
    );
    accounts.set(key, current);
  }

  return {
    syncedAt,
    positionDate,
    accounts: Object.fromEntries(accounts.entries())
  };
}
