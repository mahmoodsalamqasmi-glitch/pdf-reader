export class PageStore {
  constructor({ container, pageTemplate, viewportManager }) {
    this.container = container;
    this.pageTemplate = pageTemplate;
    this.viewportManager = viewportManager;
    this.pages = new Map();
  }

  clear() {
    this.pages.clear();
    this.container.replaceChildren();
  }

  async create(pdf) {
    this.clear();
    const fragment = document.createDocumentFragment();
    const firstPage = await pdf.getPage(1);
    const fallbackViewport = this.viewportManager.viewport(firstPage);

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const shell = this.pageTemplate.content.firstElementChild.cloneNode(true);
      shell.dataset.page = pageNumber;
      shell.style.width = `${fallbackViewport.width}px`;
      shell.style.height = `${fallbackViewport.height}px`;
      shell.querySelector(".page-label").textContent = `Page ${pageNumber}`;
      fragment.append(shell);

      this.pages.set(pageNumber, {
        pageNumber,
        page: pageNumber === 1 ? firstPage : null,
        pagePromise: pageNumber === 1 ? Promise.resolve(firstPage) : null,
        pdf,
        shell,
        canvas: shell.querySelector(".pdf-page-canvas"),
        annotationLayer: shell.querySelector(".annotation-layer"),
        inkLayer: shell.querySelector(".ink-layer"),
        textLayer: shell.querySelector(".textLayer"),
        renderedScale: 0,
        renderedRotation: null,
        renderVersion: 0
      });
    }

    this.container.append(fragment);
    return this.pages;
  }

  async getPage(pageNumber) {
    const item = this.pages.get(pageNumber);
    if (!item) return null;

    if (!item.pagePromise) {
      item.pagePromise = item.pdf.getPage(pageNumber);
    }

    item.page = await item.pagePromise;
    return item.page;
  }

  get(pageNumber) {
    return this.pages.get(pageNumber);
  }

  forEach(callback) {
    this.pages.forEach(callback);
  }

  values() {
    return this.pages.values();
  }
}
