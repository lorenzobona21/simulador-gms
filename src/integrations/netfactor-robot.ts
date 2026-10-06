import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseNetfactorPositionText, type NetfactorAccountPosition } from "./netfactor-position-parser.ts";
import { extractPdfText } from "./netfactor-pdf-text.ts";

export type NetfactorRobotOptions = {
  reportDate?: Date;
  headless?: boolean;
  outputDir?: string;
  log?: (message: string) => void;
};

export type NetfactorRobotResult = {
  pdfPath: string;
  textLength: number;
  records: number;
  accountsCount: number;
  unmatchedDataLines: number;
  totalCurrentGrossValue: number;
  totalCurrentNetValue: number;
  accountPositions: NetfactorAccountPosition[];
};

export type NetfactorReportInspectOptions = {
  target: string;
  label: string;
  headless?: boolean;
  outputDir?: string;
  log?: (message: string) => void;
};

export type NetfactorGenericReportPdfOptions = NetfactorReportInspectOptions & {
  reportDate?: Date;
  accountCode?: string;
  accountCodeStart?: string;
  accountCodeEnd?: string;
  investorName?: string;
};

const defaultUrl = "https://sistemagms.isafe.tec.br/netFactor/jsp/nfInicia.jsp";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function formatBrazilDate(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(value);
}

function formatIsoDate(value: Date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(value);
}

async function importPlaywright() {
  const importModule = new Function("specifier", "return import(specifier)") as <T>(specifier: string) => Promise<T>;
  const module = await importModule<any>(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
  return module.chromium ? module : module.default;
}

function pageFrames(page: any) {
  return typeof page.frames === "function" ? page.frames() : [page];
}

async function waitForFrames(page: any) {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.waitForTimeout(3000);
}

async function waitForSelectorInFrames(page: any, selector: string, timeout = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    for (const frame of pageFrames(page)) {
      const locator = frame.locator(selector).first();
      if (await locator.count().catch(() => 0)) return;
    }
    await page.waitForTimeout(500).catch(() => undefined);
  }

  throw new Error(`Timed out waiting for ${selector} in NetFactor frames.`);
}

async function gotoWithTimeout(page: any, url: string, timeout = 60000) {
  await Promise.race([
    page.goto(url, { waitUntil: "domcontentloaded", timeout }).catch((error: unknown) => {
      throw error;
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out opening ${url} after ${timeout}ms.`)), timeout)
    )
  ]);
}

async function clickFirstAvailable(page: any, labels: string[]) {
  await waitForFrames(page);
  for (const frame of pageFrames(page)) {
    for (const label of labels) {
      const pattern = new RegExp(label, "i");
      const byLink = frame.getByRole("link", { name: pattern }).first();
      if (await byLink.count().catch(() => 0)) {
        await byLink.click();
        return;
      }

      const byButton = frame.getByRole("button", { name: pattern }).first();
      if (await byButton.count().catch(() => 0)) {
        await byButton.click();
        return;
      }

      const byText = frame.getByText(pattern).first();
      if (await byText.count().catch(() => 0)) {
        await byText.click();
        return;
      }
    }
  }

  throw new Error(`Could not find clickable item for: ${labels.join(", ")}`);
}

async function fillFirstAvailable(page: any, selectors: string[], value: string) {
  await waitForFrames(page);
  for (const frame of pageFrames(page)) {
    for (const selector of selectors) {
      await frame.waitForSelector(selector, { timeout: 2500 }).catch(() => undefined);
      const locator = frame.locator(selector).first();
      if (await locator.count().catch(() => 0)) {
        await locator.fill(value);
        await locator.evaluate((element: HTMLElement) => {
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
          element.blur();
        });
        return;
      }
    }
  }

  throw new Error(`Could not find input for selectors: ${selectors.join(", ")}`);
}

async function saveDiagnostics(page: any, outputDir: string, label: string) {
  const safeLabel = label.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
  await mkdir(outputDir, { recursive: true });
  await page.screenshot({ path: join(outputDir, `${safeLabel}.png`), fullPage: true }).catch(() => undefined);
  await writeFile(join(outputDir, `${safeLabel}.html`), await page.content().catch(() => ""), "utf8").catch(
    () => undefined
  );
  for (const [index, frame] of pageFrames(page).entries()) {
    const frameName = frame.name?.() || `frame-${index}`;
    const frameLabel = frameName.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
    await writeFile(
      join(outputDir, `${safeLabel}-${index}-${frameLabel}.html`),
      await frame.content().catch(() => ""),
      "utf8"
    ).catch(() => undefined);
  }
}

async function ensureCheckbox(page: any, label: RegExp, checked: boolean) {
  for (const frame of pageFrames(page)) {
    const byLabel = frame.getByLabel(label).first();
    if (await byLabel.count().catch(() => 0)) {
      if (checked) await byLabel.check();
      else await byLabel.uncheck();
      return;
    }
  }
}

async function setCheckboxBySelector(page: any, selector: string, checked: boolean) {
  await waitForFrames(page);
  for (const frame of pageFrames(page)) {
    const changed = await frame
      .evaluate(
        ({ cssSelector, shouldCheck }: { cssSelector: string; shouldCheck: boolean }) => {
          const input = document.querySelector(cssSelector) as HTMLInputElement | null;
          if (!input) return false;
          input.checked = shouldCheck;
          input.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        },
        { cssSelector: selector, shouldCheck: checked }
      )
      .catch(() => false);

    if (changed) return;
  }
}

async function submitMenu(page: any, target: string) {
  await waitForFrames(page);
  for (const frame of pageFrames(page)) {
    const submitted = await frame
      .evaluate((jsp: string) => {
        const anyWindow = window as any;
        if (typeof anyWindow.submitMenu === "function") {
          anyWindow.submitMenu(jsp);
          return true;
        }
        return false;
      }, target)
      .catch(() => false);

    if (submitted) {
      await page.waitForLoadState("networkidle").catch(() => undefined);
      await waitForFrames(page);
      return;
    }
  }

  for (const frame of pageFrames(page)) {
    const submitted = await frame
      .evaluate((jsp: string) => {
        const form =
          ((document as any).obFormMenu as HTMLFormElement | undefined) ||
          ((document as any).obFormMenuAtalho as HTMLFormElement | undefined);
        if (!form) return false;
        form.action = jsp;
        form.target = "_self";
        form.submit();
        return true;
      }, target)
      .catch(() => false);

    if (submitted) {
      await page.waitForLoadState("networkidle").catch(() => undefined);
      await waitForFrames(page);
      return;
    }
  }

  throw new Error(`Could not call submitMenu for ${target}`);
}

async function submitFooterPrint(page: any) {
  await waitForFrames(page);
  for (const frame of pageFrames(page)) {
    const submitted = await frame
      .evaluate(() => {
        const parentWindow = window.parent as any;
        const form = parentWindow?.corpo?.document?.obCadForm as HTMLFormElement | undefined;
        if (form) {
          parentWindow.open(
            "",
            "netfactorPdf",
            "width=1100,height=800,directories=no,location=0,menubar=no,scrollbars=yes,status=no,toolbar=no,resizable=yes,left=0,top=0"
          );
          form.target = "netfactorPdf";
          form.submit();
          return true;
        }
        return false;
      })
      .catch(() => false);

    if (submitted) return;

    const footerLink = frame.locator("a[href*='submita']").first();
    if (await footerLink.count().catch(() => 0)) {
      await footerLink.click({ force: true, noWaitAfter: true, timeout: 5000 });
      return;
    }
  }

  throw new Error("Could not call footer print function.");
}

async function submitReportForm(page: any) {
  await waitForFrames(page);
  for (const frame of pageFrames(page)) {
    const submitted = await frame
      .evaluate(() => {
        const form = (document as any).obCadForm as HTMLFormElement | undefined;
        if (!form) return false;
        const imprimir = form.querySelector("input[name='imprimir']") as HTMLInputElement | null;
        if (imprimir) imprimir.value = "true";
        form.target = "netfactorPdf";
        form.submit();
        return true;
      })
      .catch(() => false);

    if (submitted) return;
  }

  throw new Error("Could not submit NetFactor report form.");
}

function isPdfUrl(value: string) {
  return /\/netFactor\/pdf\/reports\/.+\.pdf/i.test(value) || /\.pdf(?:$|\?)/i.test(value);
}

async function savePdfFromUrl(context: any, pdfUrl: string, pdfPath: string) {
  const response = await context.request.get(pdfUrl, { timeout: 120000 });
  if (!response.ok()) {
    throw new Error(`Could not download PDF from ${pdfUrl}: ${response.status()}`);
  }
  await writeFile(pdfPath, await response.body());
}

async function savePdfFromPageUrl(context: any, page: any, pdfPath: string, timeout: number, log: (message: string) => void) {
  const startedAt = Date.now();
  let previousUrl = "";

  while (Date.now() - startedAt < timeout) {
    await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => undefined);
    const currentUrl = page.url();
    if (currentUrl !== previousUrl) {
      log(`pdf window url: ${currentUrl}`);
      previousUrl = currentUrl;
    }

    if (isPdfUrl(currentUrl)) {
      await savePdfFromUrl(context, currentUrl, pdfPath);
      return;
    }

    await page.waitForTimeout(1000).catch(() => undefined);
  }

  throw new Error(`PDF window did not expose a PDF URL within ${timeout}ms.`);
}

async function waitForPdfArtifact(context: any, page: any, pdfPath: string, timeout: number, log: (message: string) => void) {
  const startedAt = Date.now();

  const downloadPromise = page
    .waitForEvent("download", { timeout })
    .then(async (download: any) => {
      await download.saveAs(pdfPath);
      return "download";
    });

  const popupPromise = page
    .waitForEvent("popup", { timeout })
    .then(async (popup: any) => {
      await popup.waitForLoadState("domcontentloaded", { timeout: 120000 }).catch(() => undefined);
      const popupUrl = popup.url();
      log(`popup url: ${popupUrl}`);
      if (isPdfUrl(popupUrl)) {
        await savePdfFromUrl(context, popupUrl, pdfPath);
        return "popup-url";
      }

      await savePdfFromPageUrl(context, popup, pdfPath, 30000, log);
      return "popup-page-url";
    });

  const contextPagePromise = context
    .waitForEvent("page", { timeout })
    .then(async (newPage: any) => {
      await savePdfFromPageUrl(context, newPage, pdfPath, 60000, log);
      return "context-page-url";
    });

  const responsePromise = page
    .waitForResponse(
      (response: any) => {
        const contentType = response.headers()["content-type"] || "";
        return contentType.toLowerCase().includes("pdf") || isPdfUrl(response.url());
      },
      { timeout }
    )
    .then(async (response: any) => {
      await writeFile(pdfPath, await response.body());
      return "response";
    });

  const pollingPromise = new Promise<string>((resolve, reject) => {
    const timer = setInterval(async () => {
      try {
        for (const candidate of context.pages()) {
          const candidateUrl = candidate.url();
          if (isPdfUrl(candidateUrl)) {
            clearInterval(timer);
            await savePdfFromUrl(context, candidateUrl, pdfPath);
            resolve("polling-page-url");
            return;
          }
        }

        if (Date.now() - startedAt > timeout) {
          clearInterval(timer);
          reject(new Error("Timed out waiting for PDF page URL."));
        }
      } catch (error) {
        clearInterval(timer);
        reject(error);
      }
    }, 1000);
  });

  const timeoutPromise = new Promise<string>((_, reject) => {
    setTimeout(() => reject(new Error(`Timed out waiting ${timeout}ms for the NetFactor PDF window.`)), timeout);
  });

  return Promise.race([
    Promise.any([downloadPromise, popupPromise, contextPagePromise, responsePromise, pollingPromise]),
    timeoutPromise
  ]);
}

export async function captureNetfactorPositionPdf(options: NetfactorRobotOptions = {}): Promise<NetfactorRobotResult> {
  const url = process.env.NETFACTOR_URL || defaultUrl;
  const username = requiredEnv("NETFACTOR_USERNAME");
  const password = requiredEnv("NETFACTOR_PASSWORD");
  const reportDate = options.reportDate ?? new Date();
  const outputDir = options.outputDir ?? "work/netfactor-downloads";
  const playwright = await importPlaywright();
  const log = options.log ?? (() => undefined);
  const pdfTimeout = Number(process.env.NETFACTOR_PDF_TIMEOUT_MS || 360000);
  const headless =
    options.headless ?? !["0", "false", "no"].includes((process.env.NETFACTOR_HEADLESS || "true").toLowerCase());

  await mkdir(outputDir, { recursive: true });

  const browser = await playwright.chromium.launch({
    headless,
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome"
  });

  const context = await browser.newContext({ acceptDownloads: true });
  let page: any;

  try {
    page = await context.newPage();
    if (process.env.NETFACTOR_DEBUG_NETWORK === "1") {
      page.on("request", (request: any) => {
        const url = request.url();
        if (url.includes("netFactor")) log(`request ${request.method()} ${url}`);
        if (url.includes("nfRelatorioPosicaoDebentures.jsp") && request.method() === "POST") {
          log(`postdata ${request.postData() || ""}`);
        }
      });
      page.on("response", (response: any) => {
        const url = response.url();
        if (url.includes("netFactor")) {
          log(`response ${response.status()} ${response.headers()["content-type"] || ""} ${url}`);
        }
      });
    }
    log("opening NetFactor");
    await gotoWithTimeout(page, url);
    await waitForFrames(page);

    log("filling login");
    await fillFirstAvailable(
      page,
      [
        "input[name='login']",
        "input[name='obhUsuario']",
        "input#obhUsuario",
        "input[name='usuario']",
        "input[name='user']",
        "input[id*='login' i]",
        "input[id*='usuario' i]",
        "input[type='text']"
      ],
      username
    );
    await fillFirstAvailable(
      page,
      ["input[name='obhSenha']", "input#obhSenha", "input[name='senha']", "input[name='password']", "input[id*='senha' i]", "input[type='password']"],
      password
    );

    log("submitting login");
    await Promise.all([
      page.waitForLoadState("networkidle").catch(() => undefined),
      clickFirstAvailable(page, ["entrar"])
    ]);

    log("opening posicao de debentures");
    await submitMenu(page, "nfRelatorioPosicaoDebentures.jsp");

    log("filling report date");
    await fillFirstAvailable(
      page,
      [
        "input[name*='referencia' i]",
        "input[name*='atualizacao' i]",
        "input[name*='data' i]",
        "input[id*='referencia' i]",
        "input[id*='data' i]",
        "input[type='text']"
      ],
      formatBrazilDate(reportDate)
    );
    await page.keyboard.press("Tab").catch(() => undefined);
    await page.waitForTimeout(500);

    log("checking report options");
    await ensureCheckbox(page, /Agrupamento por Debenturista/i, true);
    await ensureCheckbox(page, /Nao imprime resgatadas|Não imprime resgatadas/i, false);
    await setCheckboxBySelector(page, "#agrupamentoPorDebenturista", true);
    await setCheckboxBySelector(page, "#naoImprimeResgatadas", false);

    if (process.env.NETFACTOR_STOP_BEFORE_PRINT === "1") {
      await saveDiagnostics(page, outputDir, "netfactor-before-print");
      throw new Error("Stopped before print for NetFactor diagnostics.");
    }

    log("clicking imprimir");
    const pdfPath = join(outputDir, `netfactor-posicao-debentures-${formatIsoDate(reportDate)}.pdf`);
    const pdfArtifactPromise = waitForPdfArtifact(context, page, pdfPath, pdfTimeout, log);
    await submitFooterPrint(page).catch(() => submitReportForm(page));

    log("waiting for pdf");
    const artifactSource = await pdfArtifactPromise;
    log(`pdf captured by ${artifactSource}`);

    const pdfBytes = await import("node:fs/promises").then(fs => fs.readFile(pdfPath));
    log("extracting pdf text");
    const text = await extractPdfText(new Uint8Array(pdfBytes));
    const parsed = parseNetfactorPositionText(text);

    return {
      pdfPath,
      textLength: text.length,
      records: parsed.rows.length,
      accountsCount: parsed.accounts.length,
      unmatchedDataLines: parsed.unmatchedDataLines.length,
      totalCurrentGrossValue: parsed.accounts.reduce((sum, account) => sum + account.totalCurrentGrossValue, 0),
      totalCurrentNetValue: parsed.accounts.reduce((sum, account) => sum + account.totalCurrentNetValue, 0),
      accountPositions: parsed.accounts
    };
  } catch (error) {
    if (page) await saveDiagnostics(page, outputDir, "netfactor-error");
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

export async function inspectNetfactorReportScreen(options: NetfactorReportInspectOptions) {
  const url = process.env.NETFACTOR_URL || defaultUrl;
  const username = requiredEnv("NETFACTOR_USERNAME");
  const password = requiredEnv("NETFACTOR_PASSWORD");
  const outputDir = options.outputDir ?? "work/netfactor-downloads";
  const playwright = await importPlaywright();
  const log = options.log ?? (() => undefined);
  const headless =
    options.headless ?? !["0", "false", "no"].includes((process.env.NETFACTOR_HEADLESS || "true").toLowerCase());

  await mkdir(outputDir, { recursive: true });

  const browser = await playwright.chromium.launch({
    headless,
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome"
  });

  const context = await browser.newContext({ acceptDownloads: true });
  let page: any;

  try {
    page = await context.newPage();
    log("opening NetFactor");
    await gotoWithTimeout(page, url);
    await waitForFrames(page);

    log("filling login");
    await fillFirstAvailable(
      page,
      [
        "input[name='login']",
        "input[name='obhUsuario']",
        "input#obhUsuario",
        "input[name='usuario']",
        "input[name='user']",
        "input[id*='login' i]",
        "input[id*='usuario' i]",
        "input[type='text']"
      ],
      username
    );
    await fillFirstAvailable(
      page,
      ["input[name='obhSenha']", "input#obhSenha", "input[name='senha']", "input[name='password']", "input[id*='senha' i]", "input[type='password']"],
      password
    );

    log("submitting login");
    await Promise.all([
      page.waitForLoadState("networkidle").catch(() => undefined),
      clickFirstAvailable(page, ["entrar"])
    ]);

    log(`opening report ${options.target}`);
    await submitMenu(page, options.target);
    await waitForFrames(page);

    log("saving diagnostics");
    await saveDiagnostics(page, outputDir, options.label);

    return {
      ok: true,
      target: options.target,
      label: options.label,
      outputDir
    };
  } catch (error) {
    if (page) await saveDiagnostics(page, outputDir, `${options.label}-error`);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function prepareGenericReportForm(
  page: any,
  options: Pick<NetfactorGenericReportPdfOptions, "accountCode" | "accountCodeStart" | "accountCodeEnd" | "investorName"> = {}
) {
  await waitForFrames(page);
  await waitForSelectorInFrames(page, "form[name='obCadForm'] input[name='debCodigoIni']", 30000);
  const snapshots: Array<{ debCodigoIni: string; debCodigoFin: string; debNome: string }> = [];
  const errors: string[] = [];
  for (const frame of pageFrames(page)) {
    const codeStart = frame.locator("form[name='obCadForm'] input[name='debCodigoIni']").first();
    if (!(await codeStart.count().catch(() => 0))) continue;

    try {
      const codeEnd = frame.locator("form[name='obCadForm'] input[name='debCodigoFin']").first();
      const nameInput = frame.locator("form[name='obCadForm'] input[name='debNome']").first();
      const imprimir = frame.locator("form[name='obCadForm'] input[name='imprimir']").first();

      const accountStart = options.accountCodeStart ?? options.accountCode;
      const accountEnd = options.accountCodeEnd ?? options.accountCode;

      if (accountStart !== undefined) {
        await codeStart.fill(accountStart, { timeout: 5000 });
      }

      if (accountEnd !== undefined) {
        await codeEnd.fill(accountEnd, { timeout: 5000 });
      }

      if (await nameInput.count().catch(() => 0)) {
        await nameInput.fill(options.investorName || "", { timeout: 5000 });
      }

      if (await imprimir.count().catch(() => 0)) {
        await imprimir.evaluate((element: HTMLInputElement) => {
          element.value = "true";
          element.setAttribute("value", "true");
        });
      }

      snapshots.push({
        debCodigoIni: await codeStart.inputValue(),
        debCodigoFin: await codeEnd.inputValue(),
        debNome: (await nameInput.count().catch(() => 0)) ? await nameInput.inputValue() : ""
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (options.accountCode || options.accountCodeStart || options.accountCodeEnd || options.investorName) {
    const matchedSnapshot = snapshots.find(
      snapshot =>
        (!options.accountCode ||
          (snapshot.debCodigoIni === options.accountCode && snapshot.debCodigoFin === options.accountCode)) &&
        (!options.accountCodeStart || snapshot.debCodigoIni === options.accountCodeStart) &&
        (!options.accountCodeEnd || snapshot.debCodigoFin === options.accountCodeEnd) &&
        (!options.investorName || snapshot.debNome.toUpperCase() === options.investorName.toUpperCase())
    );

    if (!matchedSnapshot) {
      throw new Error(`Could not confirm NetFactor report filters: ${JSON.stringify({ snapshots, errors })}`);
    }
  }

  return snapshots;
}

export async function captureNetfactorGenericReportPdf(options: NetfactorGenericReportPdfOptions) {
  const url = process.env.NETFACTOR_URL || defaultUrl;
  const username = requiredEnv("NETFACTOR_USERNAME");
  const password = requiredEnv("NETFACTOR_PASSWORD");
  const outputDir = options.outputDir ?? "work/netfactor-downloads";
  const playwright = await importPlaywright();
  const log = options.log ?? (() => undefined);
  const pdfTimeout = Number(process.env.NETFACTOR_PDF_TIMEOUT_MS || 360000);
  const headless =
    options.headless ?? !["0", "false", "no"].includes((process.env.NETFACTOR_HEADLESS || "true").toLowerCase());

  await mkdir(outputDir, { recursive: true });

  const browser = await playwright.chromium.launch({
    headless,
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome"
  });

  const context = await browser.newContext({ acceptDownloads: true });
  let page: any;

  try {
    page = await context.newPage();
    log("opening NetFactor");
    await gotoWithTimeout(page, url);
    await waitForFrames(page);

    log("filling login");
    await fillFirstAvailable(
      page,
      [
        "input[name='login']",
        "input[name='obhUsuario']",
        "input#obhUsuario",
        "input[name='usuario']",
        "input[name='user']",
        "input[id*='login' i]",
        "input[id*='usuario' i]",
        "input[type='text']"
      ],
      username
    );
    await fillFirstAvailable(
      page,
      ["input[name='obhSenha']", "input#obhSenha", "input[name='senha']", "input[name='password']", "input[id*='senha' i]", "input[type='password']"],
      password
    );

    log("submitting login");
    await Promise.all([
      page.waitForLoadState("networkidle").catch(() => undefined),
      clickFirstAvailable(page, ["entrar"])
    ]);

    log(`opening report ${options.target}`);
    await submitMenu(page, options.target);
    await waitForFrames(page);
    const formSnapshots = await prepareGenericReportForm(page, options);
    log(`report filters: ${JSON.stringify(formSnapshots)}`);
    await saveDiagnostics(page, outputDir, `${options.label}-before-print`);

    const pdfPath = join(outputDir, `${options.label}.pdf`);
    const textPath = join(outputDir, `${options.label}.txt`);
    const pdfArtifactPromise = waitForPdfArtifact(context, page, pdfPath, pdfTimeout, log);

    log("clicking imprimir");
    await submitFooterPrint(page).catch(() => submitReportForm(page));

    log("waiting for pdf");
    const artifactSource = await pdfArtifactPromise;
    log(`pdf captured by ${artifactSource}`);

    const pdfBytes = await import("node:fs/promises").then(fs => fs.readFile(pdfPath));
    const text = await extractPdfText(new Uint8Array(pdfBytes));
    await writeFile(textPath, text, "utf8");

    return {
      ok: true,
      target: options.target,
      label: options.label,
      pdfPath,
      textPath,
      textLength: text.length
    };
  } catch (error) {
    if (page) await saveDiagnostics(page, outputDir, `${options.label}-error`);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}
