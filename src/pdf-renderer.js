import puppeteer from "puppeteer";

const defaultMargin = {
  top: "18mm",
  right: "16mm",
  bottom: "18mm",
  left: "16mm"
};

let browserPromise;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--font-render-hinting=medium"
      ]
    });
  }

  return browserPromise;
}

export async function renderHtmlToPdf({
  html,
  direction = "ltr",
  format = "A4",
  margin = defaultMargin,
  scale = 1
}) {
  if (!html || typeof html !== "string") {
    throw new Error("Expected an HTML string to render.");
  }

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewport({
      width: 1280,
      height: 1600,
      deviceScaleFactor: 1
    });

    await page.setContent(html, {
      waitUntil: ["domcontentloaded", "networkidle0"],
      timeout: 30_000
    });

    await page.emulateMediaType("print");
    await page.evaluate((documentDirection) => {
      document.documentElement.dir = documentDirection === "rtl" ? "rtl" : "ltr";
    }, direction);

    return await page.pdf({
      format,
      margin,
      printBackground: true,
      preferCSSPageSize: true,
      scale,
      tagged: true
    });
  } finally {
    await page.close();
  }
}

export async function closePdfRenderer() {
  if (!browserPromise) {
    return;
  }

  const browser = await browserPromise;
  browserPromise = undefined;
  await browser.close();
}
