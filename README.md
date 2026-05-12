# HUSAINIREADER PDF Export

HUSAINIREADER now includes a server-side HTML-to-PDF export pipeline using Puppeteer.

## Why This Architecture

- Renders from real HTML and CSS, not screenshots.
- Keeps text selectable and searchable in modern PDF viewers.
- Preserves typography, layout, vector shapes, and print quality.
- Supports responsive source layouts before PDF generation.
- Supports RTL output with `direction: "rtl"`.
- Avoids `html2canvas`, rasterized pages, and flattened image PDFs.

## Run

```bash
npm install
npm start
```

Open:

```text
http://127.0.0.1:4173
```

## Export API

`POST /api/export-pdf`

Example:

```js
const response = await fetch("/api/export-pdf", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    filename: "report.pdf",
    title: "Nexora Strategy Report",
    subtitle: "Searchable, crisp, server-rendered PDF output.",
    direction: "ltr",
    sections: [
      {
        label: "Executive Summary",
        title: "Professional PDF Output",
        body: "This PDF is generated from HTML/CSS by Puppeteer and keeps text selectable."
      }
    ]
  })
});
```

Send custom `html` in the payload when you need full control over document markup and styles.
