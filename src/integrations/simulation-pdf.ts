import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync, inflateSync } from "node:zlib";
import { averageMonthlyRateInPeriod } from "../domain/simulations";

type SimulationPdfMonthly = {
  month: string;
  opening: number;
  income: number;
  grossRate: number;
  cdi: number;
  closing: number;
};

type SimulationPdfRateChange = {
  date: string;
  label: string;
  rate: number;
};

export type SimulationPdfPayload = {
  clientName: string;
  accountCode: string;
  generatedAt: string;
  startDate: string;
  endDate: string;
  isProspect?: boolean;
  sourceBalance: number;
  dailyPositionBalance?: number;
  additionalContribution: number;
  baseAmount: number;
  grossBalance?: number;
  grossIncome: number;
  incomeTax?: number;
  netIncome?: number;
  grossRate: number;
  monthlyGrossRate?: number;
  annualizedGrossRate: number;
  netBalance: number;
  taxRate?: number;
  businessDays?: number;
  elapsedDays?: number;
  portfolioWeightedCdi?: number;
  combinedWeightedCdi: number;
  cdiCurve?: SimulationPdfRateChange[];
  monthly: SimulationPdfMonthly[];
};

type PngImage = {
  width: number;
  height: number;
  rgb: Buffer;
  alpha: Buffer;
};

type PdfObject = string | Buffer;

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

const percent = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo"
});

function cleanText(value: string) {
  return value
    .replace(/[^\x20-\x7e\xa0-\xff]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pdfText(value: string) {
  return cleanText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function textLine(x: number, y: number, value: string, size = 10, font = "F1") {
  return `BT /${font} ${size} Tf ${x} ${y} Td (${pdfText(value)}) Tj ET`;
}

function estimatedTextWidth(value: string, size: number) {
  return cleanText(value).length * size * 0.5;
}

function textRight(x: number, y: number, value: string, size = 10, font = "F1") {
  return textLine(x - estimatedTextWidth(value, size), y, value, size, font);
}

function fillRgb(r: number, g: number, b: number) {
  return `${(r / 255).toFixed(3)} ${(g / 255).toFixed(3)} ${(b / 255).toFixed(3)} rg`;
}

function strokeRgb(r: number, g: number, b: number) {
  return `${(r / 255).toFixed(3)} ${(g / 255).toFixed(3)} ${(b / 255).toFixed(3)} RG`;
}

function filledRect(x: number, y: number, width: number, height: number) {
  return `${x} ${y} ${width} ${height} re f`;
}

function strokedRect(x: number, y: number, width: number, height: number) {
  return `${x} ${y} ${width} ${height} re S`;
}

function line(x1: number, y1: number, x2: number, y2: number) {
  return `${x1} ${y1} m ${x2} ${y2} l S`;
}

function imageDraw(name: string, x: number, y: number, width: number, height: number) {
  return `q ${width} 0 0 ${height} ${x} ${y} cm /${name} Do Q`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateTime.format(date);
}

function formatIsoDateBr(value: string) {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function formatPercent(value: number) {
  return `${percent.format(value)}%`;
}

function readPngWithAlpha(path: string): PngImage | undefined {
  if (!existsSync(path)) return undefined;

  const file = readFileSync(path);
  if (file.toString("ascii", 1, 4) !== "PNG") return undefined;

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];

  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunk = file.subarray(dataStart, dataEnd);

    if (type === "IHDR") {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      bitDepth = chunk.readUInt8(8);
      colorType = chunk.readUInt8(9);
    } else if (type === "IDAT") {
      idatChunks.push(chunk);
    } else if (type === "IEND") {
      break;
    }

    offset = dataEnd + 4;
  }

  if (bitDepth !== 8 || colorType !== 6 || width <= 0 || height <= 0) return undefined;

  const inflated = inflateSync(Buffer.concat(idatChunks));
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const rgba = Buffer.alloc(height * stride);
  let sourceOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const row = inflated.subarray(sourceOffset, sourceOffset + stride);
    const previousRow = y > 0 ? rgba.subarray((y - 1) * stride, y * stride) : undefined;
    const currentRow = rgba.subarray(y * stride, (y + 1) * stride);

    for (let x = 0; x < stride; x += 1) {
      const left = x >= bytesPerPixel ? currentRow[x - bytesPerPixel]! : 0;
      const up = previousRow ? previousRow[x]! : 0;
      const upLeft = previousRow && x >= bytesPerPixel ? previousRow[x - bytesPerPixel]! : 0;
      const raw = row[x]!;

      if (filter === 0) currentRow[x] = raw;
      if (filter === 1) currentRow[x] = (raw + left) & 255;
      if (filter === 2) currentRow[x] = (raw + up) & 255;
      if (filter === 3) currentRow[x] = (raw + Math.floor((left + up) / 2)) & 255;
      if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        const predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        currentRow[x] = (raw + predictor) & 255;
      }
    }

    sourceOffset += stride;
  }

  const rgb = Buffer.alloc(width * height * 3);
  const alpha = Buffer.alloc(width * height);

  for (let index = 0, pixel = 0; index < rgba.length; index += 4, pixel += 1) {
    rgb[pixel * 3] = rgba[index]!;
    rgb[pixel * 3 + 1] = rgba[index + 1]!;
    rgb[pixel * 3 + 2] = rgba[index + 2]!;
    alpha[pixel] = rgba[index + 3]!;
  }

  return { width, height, rgb, alpha };
}

function buildPageContent(payload: SimulationPdfPayload, hasLogo: boolean) {
  const generatedAt = formatDate(payload.generatedAt);
  const generatedDate = formatIsoDateBr(payload.generatedAt.slice(0, 10));
  const monthlyRows = payload.monthly.slice(0, 7);
  const entryAmount = payload.isProspect ? payload.additionalContribution : payload.sourceBalance;
  const grossBalance = payload.grossBalance ?? payload.monthly.at(-1)?.closing ?? payload.netBalance;
  const incomeTax = payload.incomeTax ?? Math.max(0, grossBalance - payload.netBalance);
  const netIncome = payload.netIncome ?? Math.max(0, payload.grossIncome - incomeTax);
  const taxRate = payload.taxRate ?? (payload.grossIncome > 0 ? incomeTax / payload.grossIncome : 0);
  const elapsedDays = payload.elapsedDays ?? 0;
  const businessDays = payload.businessDays ?? 0;
  const monthlyGrossRate = payload.monthlyGrossRate ?? averageMonthlyRateInPeriod(payload.grossRate, payload.startDate, payload.endDate);
  const maxClosing = Math.max(...monthlyRows.map(row => row.closing), payload.baseAmount, 1);
  const minClosing = Math.min(...monthlyRows.map(row => row.closing), payload.baseAmount || entryAmount);
  const range = Math.max(maxClosing - minClosing, 1);
  const cdiLabel = formatPercent(payload.combinedWeightedCdi);
  const startY = 708;

  const lines: string[] = [
    fillRgb(255, 255, 255),
    filledRect(0, 0, 595, 842)
  ];

  if (hasLogo) {
    lines.push(imageDraw("Logo", 28, 774, 72, 36));
  } else {
    lines.push(fillRgb(7, 58, 49), textLine(28, 790, "GMS", 24, "F2"));
  }

  lines.push(
    fillRgb(7, 58, 49),
    textLine(108, 798, "GMS SECURITIZADORA", 9, "F2"),
    fillRgb(23, 35, 31),
    textLine(108, 786, "Simulação de investimento", 7),
    fillRgb(23, 35, 31),
    textRight(565, 800, "Preparado para", 7),
    fillRgb(7, 58, 49),
    textRight(565, 788, payload.clientName, 8, "F2"),
    fillRgb(23, 35, 31),
    textRight(565, 776, generatedDate, 7),
    fillRgb(7, 58, 49),
    filledRect(14, startY - 58, 567, 68),
    fillRgb(21, 84, 61),
    filledRect(350, startY - 58, 231, 68),
    fillRgb(50, 92, 50),
    filledRect(378, startY - 58, 42, 68),
    fillRgb(65, 100, 45),
    filledRect(420, startY - 58, 42, 68),
    strokeRgb(82, 110, 92),
    line(454, startY - 46, 454, startY - 2),
    fillRgb(235, 241, 238),
    textLine(30, startY - 15, "Saldo bruto estimado", 7, "F2"),
    fillRgb(255, 212, 138),
    textLine(30, startY - 40, money.format(grossBalance), 22, "F3"),
    fillRgb(235, 241, 238),
    textLine(30, startY - 52, "ao final do período selecionado", 7, "F2"),
    textLine(470, startY - 18, "Rentabilidade bruta", 7),
    fillRgb(255, 255, 255),
    textLine(470, startY - 38, formatPercent(payload.grossRate * 100), 16, "F3"),
    fillRgb(235, 241, 238),
    textLine(470, startY - 50, `Rentabilidade media mensal ${formatPercent(monthlyGrossRate * 100)} a.m.`, 7),
    textLine(470, startY - 61, `CDI medio ponderado ${cdiLabel} do CDI`, 7)
  );

  const metricsTop = 650;
  if (payload.isProspect) {
    lines.push(
      fillRgb(255, 255, 255),
      filledRect(14, metricsTop - 112, 283, 112),
      filledRect(297, metricsTop - 112, 284, 112),
      strokeRgb(220, 229, 225),
      line(297, metricsTop, 297, metricsTop - 112),
      fillRgb(23, 35, 31),
      textLine(24, metricsTop - 14, "Novo aporte", 7),
      textLine(24, metricsTop - 30, money.format(entryAmount), 12, "F2"),
      textLine(24, metricsTop - 76, "IR estimado", 7),
      textLine(24, metricsTop - 92, money.format(incomeTax), 12, "F2"),
      fillRgb(109, 123, 117),
      textLine(24, metricsTop - 108, `IR médio de ${formatPercent(taxRate * 100)}`, 7),
      fillRgb(23, 35, 31),
      textLine(307, metricsTop - 14, "Rendimento bruto", 7),
      textLine(307, metricsTop - 30, money.format(payload.grossIncome), 12, "F2"),
      fillRgb(109, 123, 117),
      textLine(307, metricsTop - 48, `Rentabilidade media mensal: ${formatPercent(monthlyGrossRate * 100)} ao mes`, 7),
      fillRgb(255, 247, 231),
      filledRect(297, metricsTop - 112, 284, 56),
      fillRgb(109, 123, 117),
      textLine(307, metricsTop - 76, "Rendimento líquido", 7),
      fillRgb(185, 114, 6),
      textLine(307, metricsTop - 92, money.format(netIncome), 12, "F2"),
      fillRgb(109, 123, 117),
      textLine(307, metricsTop - 108, "após retenção estimada", 7)
    );
  } else {
    lines.push(
      fillRgb(255, 255, 255),
      filledRect(14, metricsTop - 112, 283, 112),
      filledRect(297, metricsTop - 112, 284, 112),
      strokeRgb(220, 229, 225),
      line(297, metricsTop, 297, metricsTop - 112),
      fillRgb(23, 35, 31),
      textLine(24, metricsTop - 14, "Saldo bruto atual", 7),
      textLine(24, metricsTop - 30, money.format(payload.sourceBalance), 12, "F2"),
      textLine(24, metricsTop - 76, "Novo aporte", 7),
      textLine(24, metricsTop - 92, money.format(payload.additionalContribution), 12, "F2"),
      fillRgb(109, 123, 117),
      textLine(24, metricsTop - 108, `Base aplicada ${money.format(payload.baseAmount)}`, 7),
      fillRgb(23, 35, 31),
      textLine(307, metricsTop - 14, "Rendimento bruto", 7),
      textLine(307, metricsTop - 30, money.format(payload.grossIncome), 12, "F2"),
      fillRgb(109, 123, 117),
      textLine(307, metricsTop - 48, `Rentabilidade media mensal: ${formatPercent(monthlyGrossRate * 100)} ao mes`, 7),
      fillRgb(255, 247, 231),
      filledRect(297, metricsTop - 112, 284, 56),
      fillRgb(109, 123, 117),
      textLine(307, metricsTop - 76, "Rendimento líquido", 7),
      fillRgb(185, 114, 6),
      textLine(307, metricsTop - 92, money.format(netIncome), 12, "F2"),
      fillRgb(109, 123, 117),
      textLine(307, metricsTop - 108, "após retenção estimada", 7)
    );
  }

  lines.push(
    fillRgb(185, 114, 6),
    textLine(27, 512, "EVOLUÇÃO", 7, "F2"),
    fillRgb(23, 35, 31),
    textLine(27, 494, "Projeção do saldo", 14, "F3"),
    strokeRgb(220, 229, 225),
    line(27, 350, 568, 350),
    fillRgb(255, 255, 255),
    strokedRect(516, 500, 52, 16),
    fillRgb(23, 35, 31),
    textLine(524, 505, `${businessDays} dias úteis`, 6, "F2")
  );

  const chartLeft = 52;
  const chartBottom = 363;
  const chartWidth = 480;
  const barGap = 35;
  const barWidth = Math.max(18, (chartWidth - barGap * (monthlyRows.length - 1)) / Math.max(monthlyRows.length, 1));

  monthlyRows.forEach((row, index) => {
    const height = 34 + ((row.closing - minClosing) / range) * 76;
    const x = chartLeft + index * (barWidth + barGap);
    lines.push(
      fillRgb(82, 96, 110),
      textLine(x + 4, 474, money.format(row.closing).replace(",00", ""), 6, "F2"),
      fillRgb(240, 160, 15),
      filledRect(x + 4, chartBottom, barWidth - 8, height),
      fillRgb(82, 96, 110),
      textLine(x + barWidth / 2 - 5, chartBottom - 10, row.month, 7, "F2")
    );
  });

  lines.push(
    strokeRgb(220, 229, 225),
    line(14, 342, 581, 342),
    fillRgb(255, 255, 255),
    filledRect(14, 194, 366, 148),
    fillRgb(232, 241, 238),
    filledRect(380, 194, 201, 148),
    fillRgb(185, 114, 6),
    textLine(27, 322, "DETALHAMENTO", 7, "F2"),
    fillRgb(23, 35, 31),
    textLine(27, 304, "Evolução mensal", 13, "F3"),
    fillRgb(185, 114, 6),
    textLine(392, 322, "PREMISSAS", 7, "F2"),
    fillRgb(23, 35, 31),
    textLine(392, 304, "Resumo do cenário", 13, "F3"),
    fillRgb(82, 96, 110),
    textLine(28, 284, "MES", 6, "F2"),
    textLine(105, 284, "CDI A.A.", 6, "F2"),
    textLine(170, 284, "RENTAB. MES", 6, "F2"),
    textLine(250, 284, "RENDIMENTO", 6, "F2"),
    textLine(316, 284, "SALDO FINAL", 6, "F2"),
    strokeRgb(220, 229, 225),
    line(27, 278, 368, 278)
  );

  let rowY = 264;
  for (const row of monthlyRows.slice(0, 6)) {
    lines.push(
      fillRgb(52, 68, 63),
      textLine(28, rowY, row.month, 7),
      textLine(105, rowY, formatPercent(row.cdi), 7),
      textLine(170, rowY, formatPercent(row.grossRate * 100), 7),
      textRight(292, rowY, money.format(row.income), 7),
      textRight(368, rowY, money.format(row.closing), 7, "F2"),
      strokeRgb(233, 238, 236),
      line(27, rowY - 8, 368, rowY - 8)
    );
    rowY -= 15;
  }

  const premiseRows = [
    ["Aplicação", formatIsoDateBr(payload.startDate)],
    ["Vencimento", formatIsoDateBr(payload.endDate)],
    ["Prazo", `${elapsedDays} dias corridos`],
    ["CDI médio ponderado", `${cdiLabel} do CDI`],
    ["Tributação", "IR regressivo"],
    ["Liquidez indicativa", "D+1"]
  ];
  let premiseY = 284;
  for (const [label, value] of premiseRows) {
    lines.push(
      fillRgb(109, 123, 117),
      textLine(392, premiseY, label, 7),
      fillRgb(23, 35, 31),
      textRight(568, premiseY, value, 7, "F2"),
      strokeRgb(220, 229, 225),
      line(392, premiseY - 8, 568, premiseY - 8)
    );
    premiseY -= 17;
  }

  lines.push(
    fillRgb(243, 248, 246),
    filledRect(14, 70, 567, 92),
    fillRgb(52, 68, 63),
    textLine(27, 144, "Informações importantes", 7, "F2"),
    fillRgb(82, 96, 110),
    textLine(27, 128, "Esta simulação é meramente ilustrativa e utiliza as premissas informadas. Não representa garantia de rentabilidade,", 6),
    textLine(27, 117, "oferta ou recomendação de investimento. Os resultados podem variar conforme o CDI realizado, datas,", 6),
    textLine(27, 106, "tributação e regras da operação.", 6),
    strokeRgb(220, 229, 225),
    line(27, 88, 568, 88),
    fillRgb(109, 123, 117),
    textLine(27, 76, "GMS Securitizadora", 6),
    textRight(568, 76, `Documento gerado em ${generatedDate}`, 6)
  );

  return lines.join("\n");
}

function makeObjectBuffer(value: PdfObject) {
  return typeof value === "string" ? Buffer.from(value, "latin1") : value;
}

function streamObject(dictionary: string, content: Buffer | string) {
  const buffer = typeof content === "string" ? Buffer.from(content, "latin1") : content;
  return Buffer.concat([
    Buffer.from(`<< ${dictionary} /Length ${buffer.length} >>\nstream\n`, "latin1"),
    buffer,
    Buffer.from("\nendstream", "latin1")
  ]);
}

function createFallbackSimulationPdf(payload: SimulationPdfPayload) {
  const logo = readPngWithAlpha(join(process.cwd(), "public", "brand", "logo-gms-transparent.png"));
  const content = buildPageContent(payload, Boolean(logo));
  const objects: PdfObject[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    logo
      ? "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >> /XObject << /Logo 8 0 R >> >> /Contents 7 0 R >>"
      : "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >> >> /Contents 7 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>",
    streamObject("", content)
  ];

  if (logo) {
    const compressedRgb = deflateSync(logo.rgb);
    const compressedAlpha = deflateSync(logo.alpha);
    objects.push(
      streamObject(
        `/Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /SMask 9 0 R`,
        compressedRgb
      ),
      streamObject(
        `/Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`,
        compressedAlpha
      )
    );
  }

  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n", "latin1")];
  const offsets = [0];

  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.concat(chunks).length);
    chunks.push(Buffer.from(`${index + 1} 0 obj\n`, "latin1"));
    chunks.push(makeObjectBuffer(object));
    chunks.push(Buffer.from("\nendobj\n", "latin1"));
  }

  const xrefOffset = Buffer.concat(chunks).length;
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n`, "latin1"));
  chunks.push(Buffer.from("0000000000 65535 f \n", "latin1"));
  for (const offset of offsets.slice(1)) {
    chunks.push(Buffer.from(`${String(offset).padStart(10, "0")} 00000 n \n`, "latin1"));
  }
  chunks.push(Buffer.from(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`, "latin1"));

  return Buffer.concat(chunks);
}

function escapeHtml(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMoneyCompact(value: number) {
  return money.format(value).replace(",00", "");
}

function fileDataUri(path: string, mimeType: string) {
  if (!existsSync(path)) return "";
  return `data:${mimeType};base64,${readFileSync(path).toString("base64")}`;
}

export function buildSimulationPdfHtml(payload: SimulationPdfPayload) {
  const generatedDate = formatIsoDateBr(payload.generatedAt.slice(0, 10));
  const monthlyRows = payload.monthly;
  const entryAmount = payload.isProspect ? payload.additionalContribution : payload.sourceBalance;
  const grossBalance = payload.grossBalance ?? payload.monthly.at(-1)?.closing ?? payload.netBalance;
  const incomeTax = payload.incomeTax ?? Math.max(0, grossBalance - payload.netBalance);
  const netIncome = payload.netIncome ?? Math.max(0, payload.grossIncome - incomeTax);
  const taxRate = payload.taxRate ?? (payload.grossIncome > 0 ? incomeTax / payload.grossIncome : 0);
  const elapsedDays = payload.elapsedDays ?? 0;
  const businessDays = payload.businessDays ?? 0;
  const monthlyGrossRate = payload.monthlyGrossRate ?? averageMonthlyRateInPeriod(payload.grossRate, payload.startDate, payload.endDate);
  const cdiLabel = formatPercent(payload.combinedWeightedCdi);
  const maxClosing = Math.max(...monthlyRows.map(row => row.closing), payload.baseAmount, 1);
  const minClosing = Math.min(...monthlyRows.map(row => row.closing), payload.baseAmount || entryAmount);
  const range = Math.max(maxClosing - minClosing, 1);
  const logoUri = fileDataUri(join(process.cwd(), "public", "brand", "logo-gms-transparent.png"), "image/png");
  const dmSans400 = fileDataUri(join(process.cwd(), "public", "fonts", "dm-sans-400.ttf"), "font/ttf");
  const dmSans500 = fileDataUri(join(process.cwd(), "public", "fonts", "dm-sans-500.ttf"), "font/ttf");
  const dmSans600 = fileDataUri(join(process.cwd(), "public", "fonts", "dm-sans-600.ttf"), "font/ttf");
  const dmSans700 = fileDataUri(join(process.cwd(), "public", "fonts", "dm-sans-700.ttf"), "font/ttf");
  const dmSans800 = fileDataUri(join(process.cwd(), "public", "fonts", "dm-sans-800.ttf"), "font/ttf");
  const playfair600 = fileDataUri(join(process.cwd(), "public", "fonts", "playfair-display-600.ttf"), "font/ttf");
  const playfair700 = fileDataUri(join(process.cwd(), "public", "fonts", "playfair-display-700.ttf"), "font/ttf");
  const capitalMetrics = payload.isProspect
    ? `<div class="metric"><span>Novo aporte</span><strong>${escapeHtml(money.format(payload.additionalContribution))}</strong></div>`
    : `
      <div class="metric"><span>Saldo bruto atual</span><strong>${escapeHtml(money.format(payload.sourceBalance))}</strong></div>
      <div class="metric"><span>Novo aporte</span><strong>${escapeHtml(money.format(payload.additionalContribution))}</strong></div>`;

  const chartRows = monthlyRows
    .map((row, index) => {
      const plotLeft = 78;
      const plotTop = 30;
      const plotHeight = 166;
      const plotWidth = 650;
      const step = plotWidth / Math.max(monthlyRows.length, 1);
      const barWidth = Math.min(34, Math.max(10, step * 0.42));
      const height = 38 + ((row.closing - minClosing) / range) * 118;
      const x = plotLeft + index * step + step / 2 - barWidth / 2;
      const y = plotTop + plotHeight - height;
      const labelX = plotLeft + index * step + step / 2;
      const valueSize = monthlyRows.length > 10 ? 6.2 : 9;
      const monthSize = monthlyRows.length > 10 ? 7.2 : 10;
      return `
        <text x="${labelX.toFixed(1)}" y="${Math.max(16, y - 7).toFixed(1)}" text-anchor="middle" class="chart-value" style="font-size:${valueSize}px">${escapeHtml(formatMoneyCompact(row.closing))}</text>
        <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth}" height="${height.toFixed(1)}" rx="7" fill="url(#barGradient)" />
        <text x="${labelX.toFixed(1)}" y="224" text-anchor="middle" class="chart-month" style="font-size:${monthSize}px">${escapeHtml(row.month)}</text>`;
    })
    .join("");

  const gridValues = [maxClosing, (maxClosing + minClosing) / 2, minClosing];
  const chartGrid = gridValues
    .map((value, index) => {
      const y = 30 + index * 83;
      return `
        <line x1="78" y1="${y}" x2="728" y2="${y}" class="grid-line" />
        <text x="64" y="${y + 4}" text-anchor="end" class="axis-label">${escapeHtml(formatMoneyCompact(value))}</text>`;
    })
    .join("");

  const monthlyTableColumns =
    monthlyRows.length > 12
      ? [
          monthlyRows.slice(0, Math.ceil(monthlyRows.length / 2)),
          monthlyRows.slice(Math.ceil(monthlyRows.length / 2))
        ]
      : [monthlyRows];
  const tableColumns = monthlyTableColumns
    .map(
      column => `
        <table>
          <thead><tr><th>Mês</th><th>CDI</th><th>Rent.</th><th>Rend.</th><th>Saldo</th></tr></thead>
          <tbody>${column
            .map(
              row => `
                <tr>
                  <td>${escapeHtml(row.month)}</td>
                  <td>${escapeHtml(formatPercent(row.cdi))}</td>
                  <td>${escapeHtml(formatPercent(row.grossRate * 100))}</td>
                  <td>${escapeHtml(money.format(row.income))}</td>
                  <td><strong>${escapeHtml(money.format(row.closing))}</strong></td>
                </tr>`
            )
            .join("")}</tbody>
        </table>`
    )
    .join("");

  const premiseRows = [
    ["Aplicação", formatIsoDateBr(payload.startDate)],
    ["Vencimento", formatIsoDateBr(payload.endDate)],
    ["Prazo", `${elapsedDays} dias corridos`],
    ["CDI médio ponderado", `${cdiLabel} do CDI`],
    ["Tributação", "IR regressivo"],
    ["Liquidez indicativa", "D+1"]
  ]
    .map(
      ([label, value]) => `
        <div>
          <dt>${escapeHtml(label)}</dt>
          <dd>${escapeHtml(value)}</dd>
        </div>`
    )
    .join("");

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <style>
    @font-face { font-family: "DM Sans"; font-style: normal; font-weight: 400; src: url("${dmSans400}") format("truetype"); }
    @font-face { font-family: "DM Sans"; font-style: normal; font-weight: 500; src: url("${dmSans500}") format("truetype"); }
    @font-face { font-family: "DM Sans"; font-style: normal; font-weight: 600; src: url("${dmSans600}") format("truetype"); }
    @font-face { font-family: "DM Sans"; font-style: normal; font-weight: 700; src: url("${dmSans700}") format("truetype"); }
    @font-face { font-family: "DM Sans"; font-style: normal; font-weight: 800; src: url("${dmSans800}") format("truetype"); }
    @font-face { font-family: "Playfair Display"; font-style: normal; font-weight: 600; src: url("${playfair600}") format("truetype"); }
    @font-face { font-family: "Playfair Display"; font-style: normal; font-weight: 700; src: url("${playfair700}") format("truetype"); }
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body {
      width: 210mm;
      min-height: 297mm;
      margin: 0;
      color: #173d35;
      background: #eef4f0;
      font-family: "DM Sans", Arial, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page { min-height: 297mm; padding: 6mm; }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4mm;
      padding: 4.5mm 5.5mm;
      background: rgba(255,255,255,.92);
      border: 1px solid #d7e3dd;
      border-radius: 8px;
    }
    .brand { display: flex; align-items: center; gap: 15px; }
    .brand img { width: 31mm; height: 14mm; object-fit: contain; }
    .brand strong { display: block; color: #073a31; font-size: 13px; letter-spacing: .11em; }
    .brand span, .prepared span, .metric span, .metric small { color: #6d7b75; font-size: 10.5px; }
    .prepared { text-align: right; display: grid; gap: 4px; }
    .prepared strong { color: #073a31; font-size: 13px; }
    .hero {
      display: grid;
      grid-template-columns: minmax(0, 2.05fr) minmax(62mm, 1fr);
      color: #fff;
      overflow: hidden;
      border-radius: 8px 8px 0 0;
      background:
        radial-gradient(circle at 78% 18%, rgba(253,212,138,.24), transparent 32%),
        linear-gradient(112deg, #073a31 0%, #0a4438 56%, #315a2f 100%);
    }
    .hero > div { min-height: 26mm; display: grid; align-content: center; gap: 3px; padding: 6mm 8mm; }
    .hero > div + div { border-left: 1px solid rgba(255,255,255,.24); padding-left: 8mm; }
    .hero b {
      color: #ffd48a;
      font-family: "Playfair Display", Georgia, serif;
      font-size: 32px;
      line-height: .96;
      letter-spacing: -.01em;
    }
    .hero div + div b { color: #fff; font-size: 22px; }
    .hero span { color: #eef5f2; font-size: 11.5px; font-weight: 700; }
    .hero small { color: #eef5f2; display: block; font-size: 10.5px; line-height: 1.15; }
    .metrics {
      display: grid;
      border-right: 1px solid #dce5e1;
      border-bottom: 1px solid #dce5e1;
      border-left: 1px solid #dce5e1;
      background: #fff;
      border-radius: 0 0 8px 8px;
      overflow: hidden;
    }
    .metrics-prospect { grid-template-columns: repeat(4, 1fr); }
    .metrics-base { grid-template-columns: repeat(5, 1fr); }
    .metric { min-height: 16mm; display: grid; align-content: center; gap: 3px; padding: 3.2mm 4mm; border-right: 1px solid #dce5e1; }
    .metric:last-child { border-right: 0; }
    .metric strong { color: #172536; font-size: 12.5px; line-height: 1.15; letter-spacing: -.01em; }
    .metric.highlight { background: #fff7e7; }
    .metric.highlight strong { color: #b97206; }
    .chart-section {
      margin-top: 4mm;
      padding: 4mm 5mm 3.5mm;
      background: rgba(255,255,255,.94);
      border: 1px solid #d7e3dd;
      border-radius: 8px;
    }
    .hero, .metrics, .chart-section, .details, .footer { break-inside: avoid; }
    .metric, .hero small, dd, td, th { overflow-wrap: anywhere; }
    .section-head { display: flex; align-items: flex-start; justify-content: space-between; margin: 0 0 3mm; }
    .eyebrow { color: #b97206; font-size: 10px; font-weight: 800; letter-spacing: .14em; }
    h1, h2 {
      margin: 3px 0 0;
      color: #073a31;
      font-family: "Playfair Display", Georgia, serif;
      line-height: 1.05;
    }
    h1 { font-size: 20px; }
    h2 { font-size: 17px; }
    .pill { padding: 7px 11px; border: 1px solid #dce5e1; border-radius: 999px; color: #173d35; background: #fff; font-size: 10px; font-weight: 800; }
    .chart-svg {
      width: 100%;
      height: 38mm;
      display: block;
    }
    .chart-panel { fill: url(#panelGradient); stroke: #e1ebe7; stroke-width: 1; }
    .grid-line { stroke: #cfded8; stroke-width: 1; }
    .axis-base { stroke: #b9cbc4; stroke-width: 1.4; }
    .axis-label { fill: #6d7b75; font-family: "Playfair Display", Georgia, serif; font-size: 7.5px; font-weight: 800; }
    .chart-value { fill: #24342f; font-family: "Playfair Display", Georgia, serif; font-weight: 800; }
    .chart-month { fill: #52606e; font-family: "Playfair Display", Georgia, serif; font-weight: 800; }
    .details {
      display: grid;
      grid-template-columns: minmax(0, 1.45fr) minmax(56mm, .7fr);
      gap: 0;
      margin-top: 4mm;
      overflow: hidden;
      background: #fff;
      border: 1px solid #d7e3dd;
      border-radius: 8px;
    }
    .table-block { padding: 4mm 5mm 3.5mm; }
    aside { padding: 4mm 5mm; background: #e8f1ee; border-left: 1px solid #d7e3dd; }
    table { width: 100%; border-collapse: collapse; margin-top: 1.5mm; font-size: 7px; }
    .monthly-columns { display: grid; grid-template-columns: repeat(${monthlyTableColumns.length}, minmax(0, 1fr)); gap: 3mm; }
    .monthly-columns table { margin-top: 1.5mm; table-layout: fixed; }
    .monthly-columns th, .monthly-columns td { font-size: ${monthlyTableColumns.length > 1 ? "5.8px" : "7px"}; padding: ${monthlyTableColumns.length > 1 ? "1.4px 0" : "2px 0"}; }
    .monthly-columns th:nth-child(1), .monthly-columns td:nth-child(1) { width: 9%; }
    .monthly-columns th:nth-child(2), .monthly-columns td:nth-child(2) { width: 13%; }
    .monthly-columns th:nth-child(3), .monthly-columns td:nth-child(3) { width: 13%; }
    .monthly-columns th:nth-child(4), .monthly-columns td:nth-child(4) { width: 29%; }
    .monthly-columns th:nth-child(5), .monthly-columns td:nth-child(5) { width: 36%; }
    th { color: #52606e; font-size: 7px; text-align: left; border-bottom: 1px solid #dce5e1; padding-bottom: 3px; }
    td { color: #34443f; border-bottom: 1px solid #e8eeee; padding: 2px 0; }
    td:nth-child(3), td:nth-child(4), td:nth-child(5), th:nth-child(3), th:nth-child(4), th:nth-child(5) { text-align: right; }
    dl { display: grid; gap: 4px; margin: 2mm 0 0; }
    dl div { display: flex; justify-content: space-between; gap: 10px; border-bottom: 1px solid rgba(7,58,49,.1); padding-bottom: 4px; }
    dt { color: #6d7b75; font-size: 9.5px; }
    dd { margin: 0; color: #172536; font-size: 9.5px; font-weight: 800; text-align: right; }
    .footer { margin-top: 4mm; padding: 3mm 4mm; background: rgba(255,255,255,.9); border: 1px solid #d7e3dd; border-radius: 8px; color: #52606e; font-size: 8px; line-height: 1.35; }
    .footer strong { display: block; margin-bottom: 1mm; color: #34443f; font-size: 10px; }
    .footer-row { display: flex; justify-content: space-between; margin-top: 2mm; padding-top: 2mm; border-top: 1px solid #dce5e1; color: #6d7b75; }
  </style>
</head>
<body>
  <main class="page">
    <header class="header">
      <div class="brand">
        <img src="${logoUri}" alt="GMS Securitizadora" />
        <div>
          <strong>GMS SECURITIZADORA</strong>
          <span>Simulação de investimento</span>
        </div>
      </div>
      <div class="prepared">
        <span>Preparado para</span>
        <strong>${escapeHtml(payload.clientName)}</strong>
        <span>${escapeHtml(generatedDate)}</span>
      </div>
    </header>

    <section class="hero">
      <div>
        <span>Saldo bruto estimado</span>
        <b>${escapeHtml(money.format(grossBalance))}</b>
        <small>ao final do período selecionado</small>
      </div>
      <div>
        <span>Rentabilidade bruta</span>
        <b>${escapeHtml(formatPercent(payload.grossRate * 100))}</b>
        <small>Rentabilidade média mensal: ${escapeHtml(formatPercent(monthlyGrossRate * 100))} ao mês</small>
        <small>CDI médio ponderado: ${escapeHtml(cdiLabel)} do CDI</small>
      </div>
    </section>

    <section class="metrics ${payload.isProspect ? "metrics-prospect" : "metrics-base"}">
      ${capitalMetrics}
      <div class="metric"><span>IR estimado</span><strong>${escapeHtml(money.format(incomeTax))}</strong><small>IR médio de ${escapeHtml(formatPercent(taxRate * 100))}</small></div>
      <div class="metric"><span>Rendimento bruto</span><strong>${escapeHtml(money.format(payload.grossIncome))}</strong><small>Rentabilidade média mensal: ${escapeHtml(formatPercent(monthlyGrossRate * 100))} ao mês</small></div>
      <div class="metric highlight"><span>Rendimento líquido</span><strong>${escapeHtml(money.format(netIncome))}</strong><small>após retenção estimada</small></div>
    </section>

    <section class="chart-section">
      <div class="section-head">
        <div><span class="eyebrow">EVOLUÇÃO</span><h1>Projeção do saldo</h1></div>
        <b class="pill">${escapeHtml(businessDays)} dias úteis</b>
      </div>
      <svg class="chart-svg" viewBox="0 0 760 250" role="img" aria-label="Projeção mensal do saldo">
        <defs>
          <linearGradient id="panelGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="#e8f1ee" stop-opacity=".95" />
            <stop offset="100%" stop-color="#ffffff" stop-opacity=".35" />
          </linearGradient>
          <linearGradient id="barGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="#f8aa12" />
            <stop offset="100%" stop-color="#cf8308" />
          </linearGradient>
        </defs>
        <rect x="0.5" y="0.5" width="759" height="232" rx="9" class="chart-panel" />
        ${chartGrid}
        <line x1="78" y1="196" x2="728" y2="196" class="axis-base" />
        ${chartRows}
      </svg>
    </section>

    <section class="details">
      <div class="table-block">
        <span class="eyebrow">DETALHAMENTO</span>
        <h2>Evolução mensal</h2>
        <div class="monthly-columns">${tableColumns}</div>
        <table style="display:none">
          <thead><tr><th>Mês</th><th>CDI a.a.</th><th>Rentab. mês</th><th>Rendimento</th><th>Saldo final</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
      <aside>
        <span class="eyebrow">PREMISSAS</span>
        <h2>Resumo do cenário</h2>
        <dl>${premiseRows}</dl>
      </aside>
    </section>

    <footer class="footer">
      <strong>Informações importantes</strong>
      Esta simulação é meramente ilustrativa e utiliza as premissas informadas. Não representa garantia de rentabilidade,
      oferta ou recomendação de investimento. Os resultados podem variar conforme o CDI realizado, datas, tributação e regras da operação.
      <div class="footer-row"><span>GMS Securitizadora</span><span>Documento gerado em ${escapeHtml(generatedDate)}</span></div>
    </footer>
  </main>
</body>
</html>`;
}

async function createBrowserSimulationPdf(payload: SimulationPdfPayload) {
  const isVercel = process.env.VERCEL === "1";
  const html = buildSimulationPdfHtml(payload);
  const localChrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

  if (isVercel) {
    const puppeteer = await import("puppeteer-core");
    const chromium = (await import("@sparticuz/chromium")).default;
    chromium.setGraphicsMode = false;
    const browser = await puppeteer.launch({
      args: [
        ...chromium.args,
        `--user-data-dir=/tmp/gms-pdf-${Date.now()}`,
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--hide-scrollbars",
        "--font-render-hinting=none"
      ],
      defaultViewport: { width: 1240, height: 1754, deviceScaleFactor: 1 },
      executablePath: await chromium.executablePath(),
      headless: "shell"
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load", timeout: 45_000 });
      await page.emulateMediaType("print");
      return await page.pdf({
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" }
      });
    } finally {
      await browser.close();
    }
  }

  const { chromium } = await import("playwright-core");
  const executablePath = existsSync(localChrome) ? localChrome : undefined;
  const browser = await chromium.launch({
    headless: true,
    executablePath
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1240, height: 1754 } });
    await page.setContent(html, { waitUntil: "load", timeout: 45_000 });
    await page.emulateMedia({ media: "print" });
    return await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" }
    });
  } finally {
    await browser.close();
  }
}

export async function createSimulationPdf(payload: SimulationPdfPayload) {
  try {
    return await createBrowserSimulationPdf(payload);
  } catch (error) {
    if (process.env.VERCEL === "1") {
      console.error("PDF HTML renderer failed in production.", error);
      throw error;
    }
    console.warn("PDF HTML renderer failed locally; using fallback renderer.", error);
    return createFallbackSimulationPdf(payload);
  }
}
