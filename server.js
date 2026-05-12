import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { renderHtmlToPdf } from "./src/pdf-renderer.js";
import { createNexoraDocument } from "./src/nexora-template.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4173);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

async function readJsonRequest(request) {
  let body = "";

  for await (const chunk of request) {
    body += chunk;

    if (body.length > 2_000_000) {
      throw new Error("Request body is too large.");
    }
  }

  return body ? JSON.parse(body) : {};
}

async function serveStatic(request, response) {
  const requestUrl = new URL(request.url, `http://127.0.0.1:${port}`);
  const pathname = requestUrl.pathname === "/" ? "/index.html" : decodeURIComponent(requestUrl.pathname);
  const filePath = normalize(join(root, pathname));

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const file = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(file);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

async function handleExportPdf(request, response) {
  try {
    const payload = await readJsonRequest(request);
    const html = payload.html || createNexoraDocument(payload);

    const pdf = await renderHtmlToPdf({
      html,
      direction: payload.direction,
      format: payload.format,
      margin: payload.margin,
      scale: payload.scale
    });

    const filename = encodeURIComponent(payload.filename || "nexora-document.pdf");

    response.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(pdf);
  } catch (error) {
    sendJson(response, 400, {
      error: "PDF_EXPORT_FAILED",
      message: error.message
    });
  }
}

const server = createServer(async (request, response) => {
  if (request.method === "POST" && request.url === "/api/export-pdf") {
    await handleExportPdf(request, response);
    return;
  }

  if (request.method === "GET") {
    await serveStatic(request, response);
    return;
  }

  response.writeHead(405, { Allow: "GET, POST" });
  response.end("Method not allowed");
});

server.listen(port, "127.0.0.1", () => {
  console.log(`HUSAINIREADER running at http://127.0.0.1:${port}`);
});
