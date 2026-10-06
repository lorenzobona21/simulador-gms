export async function extractPdfText(pdfData: Uint8Array): Promise<string> {
  const importModule = new Function("specifier", "return import(specifier)") as <T>(specifier: string) => Promise<T>;
  const pdfModulePath = process.env.PDFJS_MODULE_PATH || "pdfjs-dist/legacy/build/pdf.mjs";
  const pdfjs = await importModule<any>(pdfModulePath);

  const document = await pdfjs.getDocument({
    data: pdfData,
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true
  }).promise;

  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const rotatedRows = extractRotatedGroupedRows(content.items);
    const lines = new Map<number, string[]>();

    for (const item of content.items) {
      if (!("str" in item)) continue;
      const [, , , , x, y] = item.transform;
      const row = Math.round(y);
      const current = lines.get(row) ?? [];
      current.push(`${String(x).padStart(8, "0")} ${item.str}`);
      lines.set(row, current);
    }

    const pageText = [...lines.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, values]) =>
        values
          .sort()
          .map(value => value.slice(9))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim()
      )
      .filter(Boolean)
      .join("\n");

    pages.push([pageText, rotatedRows.join("\n")].filter(Boolean).join("\n"));
  }

  await document.destroy();

  return pages.join("\n");
}

type TextItem = {
  str: string;
  transform: number[];
};

const groupedFieldY = {
  debentureHolder: 21,
  quantity: 146,
  purchaseValue: 186,
  correctedValue: 259,
  yieldValue: 329,
  yieldPercent: 388,
  irrfValue: 429,
  earlyRedemptionValue: 486,
  earlyRedemptionIr: 556,
  lastMonthYieldValue: 619,
  lastMonthYieldPercent: 699,
  currentValue: 766
};

function isRotatedItem(item: unknown): item is TextItem {
  if (!item || typeof item !== "object" || !("str" in item) || !("transform" in item)) return false;
  const textItem = item as TextItem;
  const [a, b, c, d] = textItem.transform;
  return Math.abs(a) < 0.01 && b > 0 && c < 0 && Math.abs(d) < 0.01;
}

function nearestValue(items: TextItem[], targetY: number, tolerance = 10) {
  const candidates = items
    .map(item => ({ item, distance: Math.abs(item.transform[5] - targetY) }))
    .filter(candidate => candidate.distance <= tolerance)
    .sort((a, b) => a.distance - b.distance);

  return candidates[0]?.item.str.trim();
}

function stripPercent(value: string) {
  return value.replace(/\s*%/g, "").trim();
}

function extractRotatedGroupedRows(items: unknown[]) {
  const groups = new Map<number, TextItem[]>();

  for (const item of items) {
    if (!isRotatedItem(item) || !item.str.trim()) continue;
    const [, , , , x] = item.transform;
    if (x < 115) continue;
    const rowKey = Math.round(x);
    const current = groups.get(rowKey) ?? [];
    current.push(item);
    groups.set(rowKey, current);
  }

  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, rowItems]) => {
      const holder = nearestValue(rowItems, groupedFieldY.debentureHolder);
      const holderMatch = /^\((\d+)\)\s+(.+)$/.exec(holder ?? "");
      if (!holderMatch) return undefined;

      const quantity = nearestValue(rowItems, groupedFieldY.quantity);
      const purchaseValue = nearestValue(rowItems, groupedFieldY.purchaseValue);
      const correctedValue = nearestValue(rowItems, groupedFieldY.correctedValue);
      const yieldValue = nearestValue(rowItems, groupedFieldY.yieldValue);
      const yieldPercent = nearestValue(rowItems, groupedFieldY.yieldPercent);
      const irrfValue = nearestValue(rowItems, groupedFieldY.irrfValue);
      const earlyRedemptionValue = nearestValue(rowItems, groupedFieldY.earlyRedemptionValue);
      const earlyRedemptionIr = nearestValue(rowItems, groupedFieldY.earlyRedemptionIr);
      const lastMonthYieldValue = nearestValue(rowItems, groupedFieldY.lastMonthYieldValue);
      const lastMonthYieldPercent = nearestValue(rowItems, groupedFieldY.lastMonthYieldPercent);
      const currentValue = nearestValue(rowItems, groupedFieldY.currentValue);

      if (
        !quantity ||
        !purchaseValue ||
        !correctedValue ||
        !yieldValue ||
        !yieldPercent ||
        !irrfValue ||
        !earlyRedemptionValue ||
        !earlyRedemptionIr ||
        !lastMonthYieldValue ||
        !lastMonthYieldPercent ||
        !currentValue
      ) {
        return undefined;
      }

      return [
        "GROUPED",
        `(${holderMatch[1]})`,
        holderMatch[2].trim(),
        quantity,
        purchaseValue,
        correctedValue,
        yieldValue,
        stripPercent(yieldPercent),
        "%",
        irrfValue,
        earlyRedemptionValue,
        earlyRedemptionIr,
        lastMonthYieldValue,
        stripPercent(lastMonthYieldPercent),
        "%",
        currentValue
      ].join(" ");
    })
    .filter((line): line is string => Boolean(line));
}
