import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.7.284/build/pdf.min.mjs";
import {
  docIdFor,
  getRecentFiles,
  getStoredFile,
  loadJson,
  persistFile,
  saveJson
} from "./src/modules/storage.js";
import { detectHeadings, summarizeText } from "./src/modules/insights.js";
import {
  addBookmark,
  addInkStroke,
  addMark,
  addNote,
  loadAnnotations,
  removeBookmark,
  saveAnnotations
} from "./src/modules/annotations.js";
import { PageStore } from "./src/core/page-store.js";
import { ViewportManager } from "./src/core/viewport-manager.js";
import { RenderQueue } from "./src/core/render-queue.js";
import { VirtualizationEngine } from "./src/core/virtualization-engine.js";
import { ContinuousScroll } from "./src/viewer/continuous-scroll.js";
import { ZoomManager } from "./src/viewer/zoom-manager.js";
import { ThumbnailSidebar } from "./src/viewer/thumbnail-sidebar.js";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.7.284/build/pdf.worker.min.mjs";

const state = {
  activeDocId: null,
  docs: new Map(),
  scale: 1,
  rotation: 0,
  fitMode: "width",
  pageNumber: 1,
  pages: new Map(),
  searchCache: new Map(),
  annotations: null,
  viewMode: "vertical",
  readingMode: false,
  darkMode: true,
  penEnabled: false,
  toolbarVisible: true,
  touch: {
    pinchDistance: 0,
    pinchScale: 1,
    lastTapAt: 0
  }
};

const engine = {};

const elements = {
  fileInput: document.querySelector("#file-input"),
  emptyFileInput: document.querySelector("#empty-file-input"),
  dropZone: document.querySelector("#drop-zone"),
  loader: document.querySelector("#loader"),
  workspace: document.querySelector("#workspace"),
  tabs: document.querySelector("#document-tabs"),
  toolbar: document.querySelector("#toolbar"),
  thumbnailList: document.querySelector("#thumbnail-list"),
  toggleThumbnails: document.querySelector("#toggle-thumbnails"),
  bookmarkPage: document.querySelector("#bookmark-page"),
  bookmarkList: document.querySelector("#bookmark-list"),
  documentMeta: document.querySelector("#document-meta"),
  documentTitle: document.querySelector("#document-title"),
  documentPages: document.querySelector("#document-pages"),
  readingProgressLabel: document.querySelector("#reading-progress-label"),
  readingProgressBar: document.querySelector("#reading-progress-bar"),
  prevPage: document.querySelector("#prev-page"),
  nextPage: document.querySelector("#next-page"),
  pageNumber: document.querySelector("#page-number"),
  pageCount: document.querySelector("#page-count"),
  zoomOut: document.querySelector("#zoom-out"),
  zoomIn: document.querySelector("#zoom-in"),
  zoomLevel: document.querySelector("#zoom-level"),
  fitWidth: document.querySelector("#fit-width"),
  fitPage: document.querySelector("#fit-page"),
  rotatePage: document.querySelector("#rotate-page"),
  toggleViewMode: document.querySelector("#toggle-view-mode"),
  readingMode: document.querySelector("#reading-mode"),
  darkMode: document.querySelector("#dark-mode"),
  fullscreenMode: document.querySelector("#fullscreen-mode"),
  searchForm: document.querySelector("#search-form"),
  searchInput: document.querySelector("#search-input"),
  searchButton: document.querySelector("#search-button"),
  searchStatus: document.querySelector("#search-status"),
  highlightSelection: document.querySelector("#highlight-selection"),
  underlineSelection: document.querySelector("#underline-selection"),
  togglePen: document.querySelector("#toggle-pen"),
  addNote: document.querySelector("#add-note"),
  copyPageText: document.querySelector("#copy-page-text"),
  downloadPdf: document.querySelector("#download-pdf"),
  printPdf: document.querySelector("#print-pdf"),
  pages: document.querySelector("#pdf-pages"),
  pageTemplate: document.querySelector("#page-template"),
  readingTime: document.querySelector("#reading-time"),
  wordCount: document.querySelector("#word-count"),
  keywordSummary: document.querySelector("#keyword-summary"),
  tocList: document.querySelector("#toc-list"),
  notesList: document.querySelector("#notes-list"),
  clearNotes: document.querySelector("#clear-notes"),
  recentFiles: document.querySelector("#recent-files"),
  refreshInsights: document.querySelector("#refresh-insights"),
  mobileFab: document.querySelector("#mobile-fab"),
  paletteButton: document.querySelector("#command-palette-button"),
  palette: document.querySelector("#command-palette"),
  commandQuery: document.querySelector("#command-query"),
  commandResults: document.querySelector("#command-results")
};

const SESSION_KEY = "session";
const THEME_KEY = "theme";
const VIEW_KEY = "view";
const READING_KEY = "reading";

engine.viewportManager = new ViewportManager({
  getScale: () => state.scale,
  setScale: (scale) => { state.scale = scale; },
  getRotation: () => state.rotation,
  getContainer: () => elements.pages,
  getReadingMode: () => state.readingMode
});

engine.pageStore = new PageStore({
  container: elements.pages,
  pageTemplate: elements.pageTemplate,
  viewportManager: engine.viewportManager
});

engine.renderQueue = new RenderQueue({
  renderPage,
  shouldRender: (pageNumber) => engine.virtualizationEngine?.shouldRender(pageNumber) ?? true,
  maxConcurrent: window.matchMedia("(max-width: 860px)").matches ? 1 : 2
});

engine.virtualizationEngine = new VirtualizationEngine({
  pageStore: engine.pageStore,
  renderQueue: engine.renderQueue,
  unloadPage,
  onActivePage: (pageNumber) => {
    state.pageNumber = pageNumber;
    updateDocumentMeta();
    syncThumbnailSelection();
  },
  preloadMargin: window.matchMedia("(max-width: 860px)").matches ? 700 : 1100,
  keepPages: window.matchMedia("(max-width: 860px)").matches ? 1 : 2
});

engine.scroller = new ContinuousScroll({
  container: elements.pages,
  getViewMode: () => state.viewMode
});

engine.zoomManager = new ZoomManager({
  getScale: () => state.scale,
  setScale: (scale) => { state.scale = scale; },
  getFirstPage: () => engine.pageStore.get(1)?.page,
  viewportManager: engine.viewportManager,
  pageStore: engine.pageStore,
  renderQueue: engine.renderQueue,
  virtualizationEngine: engine.virtualizationEngine,
  onZoom: updateZoomLabel
});

engine.thumbnailSidebar = new ThumbnailSidebar({
  container: elements.thumbnailList,
  getPdf: () => activeDoc()?.pdf,
  onPageSelect: goToPage
});

function showLoader(label = "Loading PDF...") {
  elements.loader.querySelector("strong").textContent = label;
  elements.loader.hidden = false;
}

function hideLoader() {
  elements.loader.hidden = true;
}

function activeDoc() {
  return state.docs.get(state.activeDocId);
}

function setControlState(enabled) {
  [
    elements.prevPage,
    elements.nextPage,
    elements.pageNumber,
    elements.zoomOut,
    elements.zoomIn,
    elements.fitWidth,
    elements.fitPage,
    elements.rotatePage,
    elements.toggleViewMode,
    elements.readingMode,
    elements.fullscreenMode,
    elements.searchInput,
    elements.searchButton,
    elements.highlightSelection,
    elements.underlineSelection,
    elements.togglePen,
    elements.addNote,
    elements.copyPageText,
    elements.downloadPdf,
    elements.printPdf,
    elements.bookmarkPage,
    elements.refreshInsights
  ].forEach((element) => {
    element.disabled = !enabled;
  });
}

function saveSession() {
  saveJson(SESSION_KEY, {
    activeDocId: state.activeDocId,
    docIds: [...state.docs.keys()],
    theme: state.darkMode ? "dark" : "light",
    viewMode: state.viewMode,
    readingMode: state.readingMode
  });
}

function updateDocumentMeta() {
  const doc = activeDoc();
  if (!doc) return;

  elements.documentMeta.hidden = false;
  elements.documentTitle.textContent = doc.name;
  elements.documentPages.textContent = `${doc.pdf.numPages} pages · ${formatBytes(doc.size)}`;
  elements.pageCount.textContent = `/ ${doc.pdf.numPages}`;
  elements.pageNumber.max = doc.pdf.numPages;
  elements.pageNumber.value = state.pageNumber;
  updateZoomLabel();
  updateReadingProgress();
}

function updateZoomLabel(scale = state.scale) {
  elements.zoomLevel.textContent = `${Math.round(scale * 100)}%`;
}

function updateReadingProgress() {
  const doc = activeDoc();
  if (!doc) return;
  const progress = Math.round((state.pageNumber / doc.pdf.numPages) * 100);
  elements.readingProgressLabel.textContent = `${progress}%`;
  elements.readingProgressBar.style.width = `${progress}%`;
}

function updateTabs() {
  elements.tabs.replaceChildren();

  [...state.docs.values()].forEach((doc) => {
    const tab = document.createElement("button");
    tab.className = doc.id === state.activeDocId ? "doc-tab active" : "doc-tab";
    tab.textContent = doc.name;
    tab.title = doc.name;
    tab.addEventListener("click", () => activateDocument(doc.id));
    elements.tabs.append(tab);
  });
}

function updateLayoutClasses() {
  document.body.classList.toggle("mode-horizontal", state.viewMode === "horizontal");
  document.body.classList.toggle("reading-mode", state.readingMode);
  document.body.classList.toggle("light-mode", !state.darkMode);
  engine.scroller?.setMode(state.viewMode);
  elements.toggleViewMode.textContent = state.viewMode === "horizontal" ? "Vertical" : "Horizontal";
  elements.readingMode.textContent = state.readingMode ? "Standard" : "Reading";
  elements.darkMode.textContent = state.darkMode ? "Light" : "Dark";
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function resetViewer() {
  engine.virtualizationEngine.disconnect();
  engine.renderQueue.cancelAll();
  engine.pageStore.clear();
  engine.thumbnailSidebar.clear();
  state.pages = engine.pageStore.pages;
}

async function createPageShells() {
  const doc = activeDoc();
  await engine.pageStore.create(doc.pdf);
  state.pages = engine.pageStore.pages;
}

function pageViewport(page, scale = state.scale) {
  return engine.viewportManager.viewport(page, scale);
}

async function fitWidth() {
  state.fitMode = "width";
  engine.zoomManager.fitWidth();
}

async function fitPage() {
  state.fitMode = "page";
  engine.zoomManager.fitPage();
}

function setupObservers() {
  engine.virtualizationEngine.connect();
}

async function renderTextLayer(page, container, viewport) {
  container.replaceChildren();
  container.style.width = `${viewport.width}px`;
  container.style.height = `${viewport.height}px`;
  const textContent = await page.getTextContent();
  const layer = new pdfjsLib.TextLayer({
    textContentSource: textContent,
    container,
    viewport
  });
  await layer.render();
}

function resizeDrawingCanvas(canvas, viewport, outputScale) {
  canvas.width = viewport.width * outputScale;
  canvas.height = viewport.height * outputScale;
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
}

function createRenderCanvas(viewport, outputScale) {
  const canvas = document.createElement("canvas");
  canvas.className = "pdf-page-canvas";
  canvas.width = viewport.width * outputScale;
  canvas.height = viewport.height * outputScale;
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  canvas.dataset.renderScale = String(state.scale);
  canvas.dataset.outputScale = String(outputScale);
  return canvas;
}

async function renderPage(pageNumber) {
  const item = engine.pageStore.get(pageNumber);
  if (!item) return;
  if (item.renderedScale === state.scale && item.renderedRotation === state.rotation) return;
  if (!engine.virtualizationEngine.shouldRender(pageNumber)) return;

  engine.renderQueue.tasks.get(pageNumber)?.cancel?.();
  engine.renderQueue.deleteTask(pageNumber);

  item.page = await engine.pageStore.getPage(pageNumber);
  const renderVersion = item.renderVersion + 1;
  item.renderVersion = renderVersion;
  const viewport = engine.viewportManager.applyPageSize(item);
  const outputScale = engine.viewportManager.outputScale();
  const { annotationLayer, inkLayer, textLayer } = item;
  const nextCanvas = createRenderCanvas(viewport, outputScale);
  const context = nextCanvas.getContext("2d", { alpha: false });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
  context.clearRect(0, 0, viewport.width, viewport.height);

  const task = item.page.render({ canvasContext: context, viewport });
  engine.renderQueue.setTask(pageNumber, task);
  try {
    await task.promise;
  } finally {
    engine.renderQueue.deleteTask(pageNumber);
  }
  if (item.renderVersion !== renderVersion) return;
  item.canvas.replaceWith(nextCanvas);
  item.canvas = nextCanvas;
  resizeDrawingCanvas(inkLayer, viewport, outputScale);
  await renderTextLayer(item.page, textLayer, viewport);
  if (item.renderVersion !== renderVersion) return;

  item.renderedScale = state.scale;
  item.renderedRotation = state.rotation;
  item.shell.classList.add("rendered");
  item.shell.classList.remove("rerendering");
  renderMarks(pageNumber, annotationLayer);
  renderInk(pageNumber, inkLayer, viewport, outputScale);
}

function unloadPage(pageNumber) {
  if (Math.abs(pageNumber - state.pageNumber) <= 2) return;
  const item = engine.pageStore.get(pageNumber);
  if (!item) return;
  engine.renderQueue.cancel(pageNumber);
  item.renderVersion += 1;
  item.canvas.width = 0;
  item.canvas.height = 0;
  item.inkLayer.width = 0;
  item.inkLayer.height = 0;
  item.textLayer.replaceChildren();
  item.renderedScale = 0;
  item.shell.classList.remove("rendered");
  item.shell.classList.remove("rerendering");
}

function rerenderVisiblePages() {
  engine.pageStore.forEach((item) => {
    if (item.page) {
      engine.viewportManager.applyPageSize(item);
    }
    item.renderedScale = 0;
    item.renderedRotation = null;
    item.renderVersion += 1;
  });
  engine.virtualizationEngine.rerenderVisible();
  updateDocumentMeta();
}

async function renderThumbnails() {
  await engine.thumbnailSidebar.render();
}

function syncThumbnailSelection() {
  engine.thumbnailSidebar.sync(state.pageNumber);
}

function goToPage(pageNumber) {
  const doc = activeDoc();
  if (!doc) return;
  const target = Math.min(Math.max(Number(pageNumber) || 1, 1), doc.pdf.numPages);
  state.pageNumber = target;
  const item = engine.pageStore.get(target);
  engine.scroller.scrollToPage(item);
  updateDocumentMeta();
  syncThumbnailSelection();
  engine.renderQueue.enqueue(target, 150);
}

function changeZoom(delta) {
  state.fitMode = "custom";
  engine.zoomManager.change(delta);
}

async function getPageText(pageNumber) {
  const cacheKey = `${state.activeDocId}:${pageNumber}`;
  if (state.searchCache.has(cacheKey)) return state.searchCache.get(cacheKey);
  const page = await activeDoc().pdf.getPage(pageNumber);
  const textContent = await page.getTextContent();
  const text = textContent.items.map((item) => item.str).join(" ");
  state.searchCache.set(cacheKey, text);
  return text;
}

async function searchDocument(query) {
  if (!query.trim()) return;
  elements.searchStatus.hidden = false;
  elements.searchStatus.textContent = "Searching document...";
  const doc = activeDoc();
  const normalized = query.trim().toLowerCase();

  for (let pageNumber = state.pageNumber; pageNumber <= doc.pdf.numPages; pageNumber += 1) {
    const text = await getPageText(pageNumber);
    if (text.toLowerCase().includes(normalized)) {
      elements.searchStatus.textContent = `Found "${query}" on page ${pageNumber}.`;
      goToPage(pageNumber);
      return;
    }
  }

  for (let pageNumber = 1; pageNumber < state.pageNumber; pageNumber += 1) {
    const text = await getPageText(pageNumber);
    if (text.toLowerCase().includes(normalized)) {
      elements.searchStatus.textContent = `Found "${query}" on page ${pageNumber}.`;
      goToPage(pageNumber);
      return;
    }
  }

  elements.searchStatus.textContent = `No matches for "${query}".`;
}

function annotationRectFromSelection(type) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return [];
  const range = selection.getRangeAt(0);
  const pageShell = range.startContainer.parentElement?.closest(".pdf-page");
  if (!pageShell) return [];
  const pageNumber = Number(pageShell.dataset.page);
  const pageRect = pageShell.getBoundingClientRect();
  return [...range.getClientRects()].map((rect) => ({
    pageNumber,
    type,
    x: (rect.left - pageRect.left) / pageRect.width,
    y: (rect.top - pageRect.top) / pageRect.height,
    width: rect.width / pageRect.width,
    height: rect.height / pageRect.height
  })).filter((rect) => rect.width > 2 && rect.height > 2);
}

function saveMarksFromSelection(type) {
  const rects = annotationRectFromSelection(type);
  if (!rects.length) return;
  rects.forEach((rect) => addMark(state.annotations, rect));
  saveAnnotations(state.activeDocId, state.annotations);
  rects.forEach((rect) => renderMarks(rect.pageNumber, engine.pageStore.get(rect.pageNumber)?.annotationLayer));
  window.getSelection()?.removeAllRanges();
}

function renderMarks(pageNumber, layer) {
  if (!layer || !state.annotations) return;
  layer.replaceChildren();
  state.annotations.marks
    .filter((mark) => mark.pageNumber === pageNumber)
    .forEach((mark) => {
      const node = document.createElement("i");
      node.className = mark.type === "underline" ? "underline-mark" : "highlight-mark";
      node.style.left = `${mark.x * 100}%`;
      node.style.top = `${mark.y * 100}%`;
      node.style.width = `${mark.width * 100}%`;
      node.style.height = `${mark.height * 100}%`;
      layer.append(node);
    });
}

function renderBookmarks() {
  elements.bookmarkList.replaceChildren();
  state.annotations.bookmarks.forEach((pageNumber) => {
    const button = document.createElement("button");
    button.textContent = `Page ${pageNumber}`;
    button.addEventListener("click", () => goToPage(pageNumber));
    elements.bookmarkList.append(button);
  });
}

function renderNotes() {
  elements.notesList.replaceChildren();
  state.annotations.notes.forEach((note) => {
    const button = document.createElement("button");
    button.className = "note-card";
    button.innerHTML = `<strong>Page ${note.pageNumber}</strong><span>${escapeHtml(note.text)}</span>`;
    button.addEventListener("click", () => goToPage(note.pageNumber));
    elements.notesList.append(button);
  });
}

function renderInk(pageNumber, canvas, viewport, outputScale) {
  if (!state.annotations) return;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(outputScale, 0, 0, outputScale, 0, 0);
  ctx.clearRect(0, 0, viewport.width, viewport.height);
  ctx.strokeStyle = "#ef4444";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 2.5;

  state.annotations.ink
    .filter((stroke) => stroke.pageNumber === pageNumber)
    .forEach((stroke) => {
      ctx.beginPath();
      stroke.points.forEach((point, index) => {
        const x = point.x * viewport.width;
        const y = point.y * viewport.height;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
}

function wireInk(canvas, pageNumber) {
  let points = null;
  canvas.onpointerdown = (event) => {
    if (!state.penEnabled) return;
    canvas.setPointerCapture(event.pointerId);
    const rect = canvas.getBoundingClientRect();
    points = [{ x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height }];
  };
  canvas.onpointermove = (event) => {
    if (!points) return;
    const rect = canvas.getBoundingClientRect();
    points.push({ x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height });
    const item = engine.pageStore.get(pageNumber);
    const viewport = pageViewport(item.page);
    renderInk(pageNumber, canvas, viewport, Math.min(window.devicePixelRatio || 1, 3));
    const ctx = canvas.getContext("2d");
    ctx.beginPath();
    points.forEach((point, index) => {
      const x = point.x * viewport.width;
      const y = point.y * viewport.height;
      if (index) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.stroke();
  };
  canvas.onpointerup = () => {
    if (!points || points.length < 2) return;
    addInkStroke(state.annotations, { pageNumber, points });
    saveAnnotations(state.activeDocId, state.annotations);
    points = null;
  };
}

async function buildInsights() {
  const doc = activeDoc();
  if (!doc) return;
  showLoader("Extracting insights...");
  const pages = [];
  for (let pageNumber = 1; pageNumber <= doc.pdf.numPages; pageNumber += 1) {
    pages.push({ pageNumber, text: await getPageText(pageNumber) });
  }
  const wholeText = pages.map((page) => page.text).join(" ");
  const summary = summarizeText(wholeText);
  const toc = detectHeadings(pages);
  elements.readingTime.textContent = `${summary.readingMinutes} min`;
  elements.wordCount.textContent = summary.wordCount.toLocaleString();
  elements.keywordSummary.innerHTML = summary.keywords.length
    ? summary.keywords.map(({ word, count }) => `<span>${escapeHtml(word)} · ${count}</span>`).join("")
    : "<p>No dominant keywords detected.</p>";
  elements.tocList.replaceChildren();
  toc.forEach((entry) => {
    const button = document.createElement("button");
    button.innerHTML = `<strong>${escapeHtml(entry.title)}</strong><span>Page ${entry.pageNumber}</span>`;
    button.addEventListener("click", () => goToPage(entry.pageNumber));
    elements.tocList.append(button);
  });
  hideLoader();
}

async function renderRecentFiles() {
  const recent = await getRecentFiles();
  elements.recentFiles.replaceChildren();
  recent.forEach((file) => {
    const button = document.createElement("button");
    button.innerHTML = `<strong>${escapeHtml(file.name)}</strong><span>${formatBytes(file.size)}</span>`;
    button.addEventListener("click", async () => {
      const stored = await getStoredFile(file.id);
      if (stored) await openStoredDocument(stored);
    });
    elements.recentFiles.append(button);
  });
}

async function openFiles(files) {
  for (const file of files) {
    if (file.type !== "application/pdf") continue;
    const id = await persistFile(file);
    await openDocument({ id, blob: file, name: file.name, size: file.size, lastModified: file.lastModified });
  }
  renderRecentFiles();
}

async function openStoredDocument(stored) {
  await openDocument(stored);
}

async function openDocument(record) {
  if (state.docs.has(record.id)) {
    await activateDocument(record.id);
    return;
  }

  showLoader("Opening PDF...");
  const pdf = await pdfjsLib.getDocument({ data: await record.blob.arrayBuffer() }).promise;
  state.docs.set(record.id, {
    id: record.id,
    name: record.name,
    size: record.size,
    lastModified: record.lastModified,
    blob: record.blob,
    pdf
  });
  await activateDocument(record.id);
  hideLoader();
}

async function activateDocument(docId) {
  const doc = state.docs.get(docId);
  if (!doc) return;
  showLoader("Preparing workspace...");
  state.activeDocId = docId;
  state.pageNumber = 1;
  state.scale = 1;
  state.rotation = 0;
  state.fitMode = "width";
  state.annotations = loadAnnotations(docId);
  state.searchCache.clear();
  resetViewer();
  elements.dropZone.hidden = true;
  elements.workspace.hidden = false;
  await createPageShells();
  wireInkLayers();
  await fitWidth();
  setupObservers();
  renderThumbnails();
  renderBookmarks();
  renderNotes();
  updateTabs();
  updateDocumentMeta();
  buildInsights();
  saveSession();
  hideLoader();
}

function wireInkLayers() {
  engine.pageStore.forEach((item, pageNumber) => {
    wireInk(item.inkLayer, pageNumber);
  });
}

function toggleBookmark() {
  if (state.annotations.bookmarks.includes(state.pageNumber)) {
    removeBookmark(state.annotations, state.pageNumber);
  } else {
    addBookmark(state.annotations, state.pageNumber);
  }
  saveAnnotations(state.activeDocId, state.annotations);
  renderBookmarks();
}

function addCurrentNote() {
  const text = prompt(`Note for page ${state.pageNumber}`);
  if (!text?.trim()) return;
  addNote(state.annotations, state.pageNumber, text.trim());
  saveAnnotations(state.activeDocId, state.annotations);
  renderNotes();
}

async function copyCurrentPageText() {
  const text = await getPageText(state.pageNumber);
  await navigator.clipboard.writeText(text);
  elements.searchStatus.hidden = false;
  elements.searchStatus.textContent = `Copied text from page ${state.pageNumber}.`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function currentBlobUrl() {
  const doc = activeDoc();
  return doc ? URL.createObjectURL(doc.blob) : null;
}

function downloadCurrentPdf() {
  const doc = activeDoc();
  if (!doc) return;
  const url = currentBlobUrl();
  const link = document.createElement("a");
  link.href = url;
  link.download = doc.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function printCurrentPdf() {
  const url = currentBlobUrl();
  if (!url) return;
  const frame = document.createElement("iframe");
  frame.hidden = true;
  frame.src = url;
  document.body.append(frame);
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      frame.remove();
    }, 1000);
  };
}

function commandList() {
  return [
    { label: "Fit to width", run: fitWidth },
    { label: "Fit to page", run: fitPage },
    { label: "Toggle reading mode", run: () => elements.readingMode.click() },
    { label: "Toggle horizontal pages", run: () => elements.toggleViewMode.click() },
    { label: "Toggle pen", run: () => elements.togglePen.click() },
    { label: "Add bookmark", run: toggleBookmark },
    { label: "Refresh insights", run: buildInsights },
    { label: "Fullscreen", run: () => elements.fullscreenMode.click() }
  ];
}

function renderCommands(query = "") {
  elements.commandResults.replaceChildren();
  commandList()
    .filter((command) => command.label.toLowerCase().includes(query.toLowerCase()))
    .forEach((command) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = command.label;
      button.addEventListener("click", () => {
        command.run();
        elements.palette.close();
      });
      elements.commandResults.append(button);
    });
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    elements.workspace.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
}

function touchDistance(event) {
  const [a, b] = event.touches;
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function wireInputs() {
  const handleFiles = (files) => openFiles([...files]);
  elements.fileInput.addEventListener("change", (event) => handleFiles(event.target.files));
  elements.emptyFileInput.addEventListener("change", (event) => handleFiles(event.target.files));

  ["dragenter", "dragover"].forEach((eventName) => {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropZone.classList.add("drag-over");
    });
  });
  ["dragleave", "drop"].forEach((eventName) => {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropZone.classList.remove("drag-over");
    });
  });
  elements.dropZone.addEventListener("drop", (event) => handleFiles(event.dataTransfer.files));
}

function wireActions() {
  elements.prevPage.addEventListener("click", () => goToPage(state.pageNumber - 1));
  elements.nextPage.addEventListener("click", () => goToPage(state.pageNumber + 1));
  elements.pageNumber.addEventListener("change", () => goToPage(elements.pageNumber.value));
  elements.zoomOut.addEventListener("click", () => changeZoom(-0.15));
  elements.zoomIn.addEventListener("click", () => changeZoom(0.15));
  elements.fitWidth.addEventListener("click", fitWidth);
  elements.fitPage.addEventListener("click", fitPage);
  elements.rotatePage.addEventListener("click", () => {
    state.rotation = (state.rotation + 90) % 360;
    engine.renderQueue.cancelAll();
    rerenderVisiblePages();
  });
  elements.toggleViewMode.addEventListener("click", () => {
    state.viewMode = state.viewMode === "horizontal" ? "vertical" : "horizontal";
    updateLayoutClasses();
    saveSession();
  });
  elements.readingMode.addEventListener("click", () => {
    state.readingMode = !state.readingMode;
    updateLayoutClasses();
    fitWidth();
    saveSession();
  });
  elements.darkMode.addEventListener("click", () => {
    state.darkMode = !state.darkMode;
    saveJson(THEME_KEY, state.darkMode);
    updateLayoutClasses();
  });
  elements.fullscreenMode.addEventListener("click", toggleFullscreen);
  elements.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    searchDocument(elements.searchInput.value);
  });
  elements.highlightSelection.addEventListener("click", () => saveMarksFromSelection("highlight"));
  elements.underlineSelection.addEventListener("click", () => saveMarksFromSelection("underline"));
  elements.togglePen.addEventListener("click", () => {
    state.penEnabled = !state.penEnabled;
    document.body.classList.toggle("pen-mode", state.penEnabled);
    elements.togglePen.textContent = state.penEnabled ? "Pen on" : "Pen";
  });
  elements.addNote.addEventListener("click", addCurrentNote);
  elements.copyPageText.addEventListener("click", copyCurrentPageText);
  elements.downloadPdf.addEventListener("click", downloadCurrentPdf);
  elements.printPdf.addEventListener("click", printCurrentPdf);
  elements.bookmarkPage.addEventListener("click", toggleBookmark);
  elements.refreshInsights.addEventListener("click", buildInsights);
  elements.clearNotes.addEventListener("click", () => {
    state.annotations.notes = [];
    saveAnnotations(state.activeDocId, state.annotations);
    renderNotes();
  });
  elements.toggleThumbnails.addEventListener("click", () => {
    document.body.classList.toggle("hide-thumbs");
    elements.toggleThumbnails.textContent = document.body.classList.contains("hide-thumbs") ? "Show" : "Hide";
  });
  elements.mobileFab.addEventListener("click", () => {
    document.body.classList.toggle("mobile-tools-open");
  });
  elements.paletteButton.addEventListener("click", () => {
    renderCommands();
    elements.palette.showModal();
    elements.commandQuery.focus();
  });
  elements.commandQuery.addEventListener("input", () => renderCommands(elements.commandQuery.value));
}

function wireGestures() {
  elements.pages.addEventListener("touchstart", (event) => {
    if (event.touches.length === 2) {
      state.touch.pinchDistance = touchDistance(event);
      state.touch.pinchScale = state.scale;
      return;
    }

    const now = Date.now();
    if (now - state.touch.lastTapAt < 280) {
      changeZoom(state.scale < 1.8 ? 0.6 : -0.6);
    }
    state.touch.lastTapAt = now;
  }, { passive: true });

  elements.pages.addEventListener("touchmove", (event) => {
    if (event.touches.length !== 2 || !state.touch.pinchDistance) return;
    const distance = touchDistance(event);
    engine.zoomManager.previewScale(state.touch.pinchScale * (distance / state.touch.pinchDistance));
  }, { passive: true });

  const commitPinchZoom = () => {
    if (!state.touch.pinchDistance) return;
    const previewScale = state.scale * engine.zoomManager.previewScaleValue;
    state.fitMode = "custom";
    state.touch.pinchDistance = 0;
    engine.zoomManager.commitPreviewScale(previewScale);
  };

  elements.pages.addEventListener("touchend", commitPinchZoom, { passive: true });
  elements.pages.addEventListener("touchcancel", () => {
    state.touch.pinchDistance = 0;
    engine.zoomManager.clearPreview();
    updateZoomLabel();
  }, { passive: true });
}

function wireKeyboard() {
  window.addEventListener("keydown", (event) => {
    if (event.target.matches("input, textarea")) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      renderCommands();
      elements.palette.showModal();
      elements.commandQuery.focus();
    }
    if (event.key === "/") {
      event.preventDefault();
      elements.searchInput.focus();
    }
    if (event.key === "ArrowRight" || event.key === "PageDown") goToPage(state.pageNumber + 1);
    if (event.key === "ArrowLeft" || event.key === "PageUp") goToPage(state.pageNumber - 1);
    if (event.key === "+" || event.key === "=") changeZoom(0.15);
    if (event.key === "-") changeZoom(-0.15);
  });
}

function wireToolbarAutohide() {
  let lastY = window.scrollY;
  window.addEventListener("scroll", () => {
    const currentY = window.scrollY;
    const hide = currentY > lastY && currentY > 120;
    document.body.classList.toggle("toolbar-hidden", hide);
    lastY = currentY;
  }, { passive: true });
}

async function restoreSession() {
  const session = loadJson(SESSION_KEY, null);
  state.darkMode = loadJson(THEME_KEY, true);
  state.viewMode = session?.viewMode || loadJson(VIEW_KEY, "vertical");
  state.readingMode = session?.readingMode || loadJson(READING_KEY, false);
  updateLayoutClasses();
  await renderRecentFiles();

  if (!session?.docIds?.length) return;
  for (const id of session.docIds) {
    const stored = await getStoredFile(id);
    if (stored) {
      await openStoredDocument(stored);
    }
  }
  if (session.activeDocId && state.docs.has(session.activeDocId)) {
    await activateDocument(session.activeDocId);
  }
}

function initPwa() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
  window.addEventListener("load", () => document.body.classList.add("app-ready"));
}

setControlState(false);
wireInputs();
wireActions();
wireGestures();
wireKeyboard();
wireToolbarAutohide();
restoreSession();
initPwa();
