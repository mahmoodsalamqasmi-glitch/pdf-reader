import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

const state = {
  pdf: null,
  pageNumber: 1,
  scale: 1,
  rotation: 0,
  textCache: new Map(),
  pages: new Map(),
  renderQueue: new Set(),
  activeRenderTasks: new Map(),
  pageObserver: null,
  activePageObserver: null,
  pinchStartDistance: 0,
  pinchStartScale: 1
};

const elements = {
  fileInput: document.querySelector("#file-input"),
  emptyFileInput: document.querySelector("#empty-file-input"),
  dropZone: document.querySelector("#drop-zone"),
  loader: document.querySelector("#loader"),
  viewer: document.querySelector("#viewer"),
  pages: document.querySelector("#pdf-pages"),
  prevPage: document.querySelector("#prev-page"),
  nextPage: document.querySelector("#next-page"),
  pageNumber: document.querySelector("#page-number"),
  pageCount: document.querySelector("#page-count"),
  zoomOut: document.querySelector("#zoom-out"),
  zoomIn: document.querySelector("#zoom-in"),
  zoomLevel: document.querySelector("#zoom-level"),
  fitWidth: document.querySelector("#fit-width"),
  rotatePage: document.querySelector("#rotate-page"),
  downloadPdf: document.querySelector("#download-pdf"),
  printPdf: document.querySelector("#print-pdf"),
  searchForm: document.querySelector("#search-form"),
  searchInput: document.querySelector("#search-input"),
  searchButton: document.querySelector("#search-button"),
  searchStatus: document.querySelector("#search-status"),
  thumbnailList: document.querySelector("#thumbnail-list"),
  documentMeta: document.querySelector("#document-meta"),
  documentTitle: document.querySelector("#document-title"),
  documentPages: document.querySelector("#document-pages")
};

function setControlsEnabled(enabled) {
  [
    elements.prevPage,
    elements.nextPage,
    elements.pageNumber,
    elements.zoomOut,
    elements.zoomIn,
    elements.fitWidth,
    elements.rotatePage,
    elements.downloadPdf,
    elements.printPdf,
    elements.searchInput,
    elements.searchButton
  ].forEach((element) => {
    element.disabled = !enabled;
  });
}

function updateControls() {
  const hasDocument = Boolean(state.pdf);
  setControlsEnabled(hasDocument);
  elements.pageNumber.value = state.pageNumber;
  elements.pageNumber.max = state.pdf?.numPages ?? 1;
  elements.pageCount.textContent = `/ ${state.pdf?.numPages ?? 0}`;
  elements.zoomLevel.textContent = `${Math.round(state.scale * 100)}%`;
  elements.prevPage.disabled = !hasDocument || state.pageNumber <= 1;
  elements.nextPage.disabled = !hasDocument || state.pageNumber >= state.pdf.numPages;

  document.querySelectorAll(".thumb").forEach((thumb) => {
    thumb.classList.toggle("active", Number(thumb.dataset.page) === state.pageNumber);
  });
}

function showLoader(){
  document.querySelector("#loader").hidden = false;
}

function hideLoader(){
  document.querySelector("#loader").hidden = true;
}

function showSearchStatus(message) {
  elements.searchStatus.hidden = false;
  elements.searchStatus.textContent = message;
}

function hideSearchStatus() {
  elements.searchStatus.hidden = true;
  elements.searchStatus.textContent = "";
}

function resetDocumentView() {
  state.pages.clear();
  state.renderQueue.clear();
  state.activeRenderTasks.forEach((task) => task.cancel());
  state.activeRenderTasks.clear();
  state.pageObserver?.disconnect();
  state.activePageObserver?.disconnect();
  elements.pages.replaceChildren();
  elements.thumbnailList.replaceChildren();
}

async function createPageShells() {
  const fragment = document.createDocumentFragment();

  for (let pageNumber = 1; pageNumber <= state.pdf.numPages; pageNumber += 1) {
    const page = await state.pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: state.scale, rotation: state.rotation });

    const pageElement = document.createElement("section");
    pageElement.className = "pdf-page";
    pageElement.dataset.page = pageNumber;
    pageElement.style.width = `${viewport.width}px`;
    pageElement.style.height = `${viewport.height}px`;
    pageElement.setAttribute("aria-label", `Page ${pageNumber}`);

    const canvas = document.createElement("canvas");
    canvas.className = "pdf-page-canvas";

    const textLayer = document.createElement("div");
    textLayer.className = "textLayer";

    const pageNumberLabel = document.createElement("span");
    pageNumberLabel.className = "page-label";
    pageNumberLabel.textContent = `${pageNumber}`;

    pageElement.append(canvas, textLayer, pageNumberLabel);
    fragment.append(pageElement);

    state.pages.set(pageNumber, {
      page,
      pageElement,
      canvas,
      textLayer,
      renderedScale: 0,
      renderedRotation: state.rotation
    });
  }

  elements.pages.append(fragment);
}

function setupLazyRendering() {
  state.pageObserver?.disconnect();
  state.activePageObserver?.disconnect();

  state.pageObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const pageNumber = Number(entry.target.dataset.page);

      if (entry.isIntersecting) {
        renderPage(pageNumber);
      } else {
        unloadPage(pageNumber);
      }
    });
  }, {
    root: null,
    rootMargin: "900px 0px",
    threshold: 0.01
  });

  state.activePageObserver = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

    if (!visible) return;

    state.pageNumber = Number(visible.target.dataset.page);
    updateControls();
  }, {
    root: null,
    threshold: [0.35, 0.55, 0.75]
  });

  state.pages.forEach(({ pageElement }) => {
    state.pageObserver.observe(pageElement);
    state.activePageObserver.observe(pageElement);
  });
}

async function renderTextLayer(page, textLayer, viewport) {
  textLayer.replaceChildren();
  textLayer.style.width = `${viewport.width}px`;
  textLayer.style.height = `${viewport.height}px`;

  const textContent = await page.getTextContent();

  if (pdfjsLib.TextLayer) {
    const textLayerRenderer = new pdfjsLib.TextLayer({
      textContentSource: textContent,
      container: textLayer,
      viewport
    });

    await textLayerRenderer.render();
    return;
  }

  pdfjsLib.renderTextLayer({
    textContentSource: textContent,
    container: textLayer,
    viewport,
    textDivs: []
  });
}

async function renderPage(pageNumber) {
  const item = state.pages.get(pageNumber);

  if (!item || state.renderQueue.has(pageNumber)) {
    return;
  }

  if (item.renderedScale === state.scale && item.renderedRotation === state.rotation) {
    return;
  }

  state.renderQueue.add(pageNumber);

  try {
    const viewport = item.page.getViewport({ scale: state.scale, rotation: state.rotation });
    const outputScale = Math.min(window.devicePixelRatio || 1, 3);
    const context = item.canvas.getContext("2d", { alpha: false });

    item.pageElement.style.width = `${viewport.width}px`;
    item.pageElement.style.height = `${viewport.height}px`;
    item.canvas.width = Math.floor(viewport.width * outputScale);
    item.canvas.height = Math.floor(viewport.height * outputScale);
    item.canvas.style.width = `${viewport.width}px`;
    item.canvas.style.height = `${viewport.height}px`;

    context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
    context.clearRect(0, 0, viewport.width, viewport.height);

    const task = item.page.render({
      canvasContext: context,
      viewport
    });

    state.activeRenderTasks.set(pageNumber, task);
    await task.promise;
    state.activeRenderTasks.delete(pageNumber);

    await renderTextLayer(item.page, item.textLayer, viewport);

    item.renderedScale = state.scale;
    item.renderedRotation = state.rotation;
    item.pageElement.classList.add("rendered");
  } catch (error) {
    if (error?.name !== "RenderingCancelledException") {
      console.error(error);
    }
  } finally {
    state.renderQueue.delete(pageNumber);
  }
}

function unloadPage(pageNumber) {
  const item = state.pages.get(pageNumber);

  if (!item || Math.abs(pageNumber - state.pageNumber) <= 2) {
    return;
  }

  const task = state.activeRenderTasks.get(pageNumber);
  if (task) {
    task.cancel();
    state.activeRenderTasks.delete(pageNumber);
  }

  item.canvas.width = 0;
  item.canvas.height = 0;
  item.textLayer.replaceChildren();
  item.renderedScale = 0;
  item.pageElement.classList.remove("rendered");
}

async function renderThumbnails() {
  elements.thumbnailList.replaceChildren();

  for (let pageNumber = 1; pageNumber <= state.pdf.numPages; pageNumber += 1) {
    const button = document.createElement("button");
    button.className = "thumb";
    button.type = "button";
    button.dataset.page = pageNumber;
    button.setAttribute("aria-label", `Go to page ${pageNumber}`);

    const canvas = document.createElement("canvas");
    const label = document.createElement("span");
    label.textContent = `Page ${pageNumber}`;
    button.append(canvas, label);
    elements.thumbnailList.append(button);

    button.addEventListener("click", () => goToPage(pageNumber));

    const page = await state.pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 0.18 });
    const thumbContext = canvas.getContext("2d", { alpha: false });
    const outputScale = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = viewport.width * outputScale;
    canvas.height = viewport.height * outputScale;
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    thumbContext.setTransform(outputScale, 0, 0, outputScale, 0, 0);
    await page.render({ canvasContext: thumbContext, viewport }).promise;
  }

  updateControls();
}

async function openPdf(file) {

  try{

    if (!file || file.type !== "application/pdf") {
      showSearchStatus("Please choose a PDF file.");
      return;
    }

    showLoader();
    hideSearchStatus();
    resetDocumentView();

    const buffer = await file.arrayBuffer();

    state.pdf = await pdfjsLib.getDocument({
      data: buffer
    }).promise;

    state.pageNumber = 1;
    state.scale = 1;
    state.rotation = 0;
    state.textCache.clear();

    elements.dropZone.hidden = true;
    elements.viewer.hidden = false;
    elements.documentMeta.hidden = false;
    elements.documentTitle.textContent = file.name;
    elements.documentPages.textContent = `${state.pdf.numPages} page${state.pdf.numPages === 1 ? "" : "s"}`;

    await createPageShells();
    await fitToWidth();
    setupLazyRendering();
    renderThumbnails();
    renderPage(1);

  }catch(error){

    alert("Invalid or corrupted PDF file.");

    console.error(error);

  }finally{

    hideLoader();

  }

}

function goToPage(pageNumber) {
  if (!state.pdf) {
    return;
  }

  const nextPage = Math.min(Math.max(pageNumber, 1), state.pdf.numPages);
  const item = state.pages.get(nextPage);
  if (!item) {
    return;
  }

  state.pageNumber = nextPage;
  hideSearchStatus();
  item.pageElement.scrollIntoView({ behavior: "smooth", block: "start" });
  renderPage(nextPage);
  updateControls();
}

function rerenderVisiblePages() {
  state.activeRenderTasks.forEach((task) => task.cancel());
  state.activeRenderTasks.clear();

  state.pages.forEach((item, pageNumber) => {
    const viewport = item.page.getViewport({ scale: state.scale, rotation: state.rotation });
    item.pageElement.style.width = `${viewport.width}px`;
    item.pageElement.style.height = `${viewport.height}px`;
    item.renderedScale = 0;

    const rect = item.pageElement.getBoundingClientRect();
    const nearViewport = rect.bottom > -900 && rect.top < window.innerHeight + 900;

    if (nearViewport) {
      renderPage(pageNumber);
    } else {
      unloadPage(pageNumber);
    }
  });

  updateControls();
}

function changeZoom(amount) {
  state.scale = Math.min(Math.max(state.scale + amount, 0.35), 4);
  rerenderVisiblePages();
}

async function fitToWidth() {
  if (!state.pdf || state.pages.size === 0) {
    return;
  }

  const firstPage = state.pages.get(1).page;
  const viewport = firstPage.getViewport({ scale: 1, rotation: state.rotation });
  const availableWidth = Math.max(elements.viewer.clientWidth - 180, 260);
  state.scale = Math.min(Math.max(availableWidth / viewport.width, 0.35), 4);
  rerenderVisiblePages();
}

async function getPageText(pageNumber) {
  if (state.textCache.has(pageNumber)) {
    return state.textCache.get(pageNumber);
  }

  const page = await state.pdf.getPage(pageNumber);
  const content = await page.getTextContent();
  const text = content.items.map((item) => item.str).join(" ");
  state.textCache.set(pageNumber, text);
  return text;
}

async function searchDocument(query) {
  if (!state.pdf || !query.trim()) {
    return;
  }

  const normalizedQuery = query.trim().toLowerCase();
  showSearchStatus("Searching document...");

  for (let pageNumber = state.pageNumber; pageNumber <= state.pdf.numPages; pageNumber += 1) {
    const text = await getPageText(pageNumber);
    if (text.toLowerCase().includes(normalizedQuery)) {
      showSearchStatus(`Found "${query}" on page ${pageNumber}.`);
      goToPage(pageNumber);
      return;
    }
  }

  for (let pageNumber = 1; pageNumber < state.pageNumber; pageNumber += 1) {
    const text = await getPageText(pageNumber);
    if (text.toLowerCase().includes(normalizedQuery)) {
      showSearchStatus(`Found "${query}" on page ${pageNumber}.`);
      goToPage(pageNumber);
      return;
    }
  }

  showSearchStatus(`No matches for "${query}".`);
}

function wireFileInput(input) {
  input.addEventListener("change", (event) => {
    const [file] = event.target.files;
    openPdf(file);
  });
}

function getTouchDistance(event) {
  const [first, second] = event.touches;
  return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
}

wireFileInput(elements.fileInput);
wireFileInput(elements.emptyFileInput);

elements.prevPage.addEventListener("click", () => goToPage(state.pageNumber - 1));
elements.nextPage.addEventListener("click", () => goToPage(state.pageNumber + 1));
elements.zoomOut.addEventListener("click", () => changeZoom(-0.15));
elements.zoomIn.addEventListener("click", () => changeZoom(0.15));
elements.fitWidth.addEventListener("click", fitToWidth);
elements.rotatePage.addEventListener("click", () => {
  state.rotation = (state.rotation + 90) % 360;
  rerenderVisiblePages();
});

elements.downloadPdf.addEventListener("click", () => {

  if(!state.pdf) return;

  const input = elements.fileInput;

  if(input.files.length > 0){

    const file = input.files[0];

    const url = URL.createObjectURL(file);

    const a = document.createElement("a");

    a.href = url;

    a.download = file.name;

    a.click();

  }

});

elements.printPdf.addEventListener("click", () => {
  window.print();
});

elements.pageNumber.addEventListener("change", () => {
  goToPage(Number(elements.pageNumber.value));
});

elements.searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  searchDocument(elements.searchInput.value);
});

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

elements.dropZone.addEventListener("drop", (event) => {
  const [file] = event.dataTransfer.files;
  openPdf(file);
});

elements.viewer.addEventListener("touchstart", (event) => {
  if (event.touches.length !== 2) return;

  state.pinchStartDistance = getTouchDistance(event);
  state.pinchStartScale = state.scale;
}, { passive: true });

elements.viewer.addEventListener("touchmove", (event) => {
  if (event.touches.length !== 2 || !state.pinchStartDistance) return;

  const distance = getTouchDistance(event);
  const nextScale = state.pinchStartScale * (distance / state.pinchStartDistance);
  state.scale = Math.min(Math.max(nextScale, 0.35), 4);
  rerenderVisiblePages();
}, { passive: true });

window.addEventListener("keydown", (event) => {
  if (!state.pdf || event.target.matches("input")) {
    return;
  }

  if (event.key === "ArrowLeft" || event.key === "PageUp") {
    goToPage(state.pageNumber - 1);
  }

  if (event.key === "ArrowRight" || event.key === "PageDown") {
    goToPage(state.pageNumber + 1);
  }
});

window.addEventListener("resize", () => {
  if (state.pdf) {
    fitToWidth();
  }
});

setControlsEnabled(false);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js").catch(() => {
    // The reader still works if browser privacy settings block service workers.
  });
}
