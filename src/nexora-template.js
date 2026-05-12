function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderSections(sections = []) {
  return sections.map((section) => `
    <section class="section">
      <p class="eyebrow">${escapeHtml(section.label || "Insight")}</p>
      <h2>${escapeHtml(section.title || "Untitled section")}</h2>
      <p>${escapeHtml(section.body || "")}</p>
    </section>
  `).join("");
}

export function createNexoraDocument({
  title = "Nexora Intelligence Report",
  subtitle = "A professional, searchable, vector-rendered PDF document.",
  direction = "ltr",
  locale = "en",
  sections = []
} = {}) {
  const fallbackSections = sections.length > 0 ? sections : [
    {
      label: "Overview",
      title: "Crisp HTML-to-PDF rendering",
      body: "This document is rendered from semantic HTML and CSS through Puppeteer, preserving selectable text, layout quality, and print-ready vector output."
    },
    {
      label: "Quality",
      title: "Modern PDF viewer optimized",
      body: "Typography, spacing, page breaks, dark premium styling, and responsive source layouts are handled before export instead of flattening pages into screenshots."
    }
  ];

  return `<!doctype html>
<html lang="${escapeHtml(locale)}" dir="${direction === "rtl" ? "rtl" : "ltr"}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <style>
      @page {
        size: A4;
        margin: 18mm 16mm;
      }

      * {
        box-sizing: border-box;
      }

      html {
        color-scheme: dark;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      body {
        margin: 0;
        background: #0b0f17;
        color: #edf3ff;
        font-family: Inter, Arial, "Noto Sans Arabic", "Noto Naskh Arabic", sans-serif;
        line-height: 1.65;
        text-rendering: geometricPrecision;
      }

      .page {
        min-height: calc(297mm - 36mm);
        padding: 0;
      }

      .hero {
        border: 1px solid rgba(255,255,255,0.14);
        border-radius: 24px;
        padding: 34px;
        background:
          linear-gradient(135deg, rgba(77, 124, 254, 0.20), rgba(11, 15, 23, 0.86)),
          #111827;
        box-shadow: 0 24px 80px rgba(0,0,0,0.36);
      }

      .kicker,
      .eyebrow {
        margin: 0 0 10px;
        color: #8cc7ff;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      h1,
      h2,
      p {
        margin-top: 0;
      }

      h1 {
        margin-bottom: 14px;
        font-size: 42px;
        line-height: 1.08;
        letter-spacing: 0;
      }

      h2 {
        color: #ffffff;
        font-size: 22px;
        line-height: 1.18;
        margin-bottom: 10px;
      }

      p {
        color: #cbd5e1;
        font-size: 14px;
      }

      .subtitle {
        max-width: 680px;
        margin-bottom: 0;
        font-size: 16px;
      }

      .section-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
        margin-top: 20px;
      }

      .section {
        break-inside: avoid;
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 18px;
        padding: 22px;
        background: rgba(255,255,255,0.065);
      }

      [dir="rtl"] body {
        font-family: "Noto Naskh Arabic", "Noto Sans Arabic", Arial, sans-serif;
      }

      [dir="rtl"] .kicker,
      [dir="rtl"] .eyebrow {
        letter-spacing: 0;
      }

      @media (max-width: 760px) {
        .hero {
          padding: 24px;
          border-radius: 18px;
        }

        h1 {
          font-size: 30px;
        }

        .section-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <header class="hero">
        <p class="kicker">Nexora PDF Export</p>
        <h1>${escapeHtml(title)}</h1>
        <p class="subtitle">${escapeHtml(subtitle)}</p>
      </header>

      <div class="section-grid">
        ${renderSections(fallbackSections)}
      </div>
    </main>
  </body>
</html>`;
}
