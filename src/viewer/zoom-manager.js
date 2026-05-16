export class ZoomManager {
  constructor({
    getScale,
    setScale,
    getFirstPage,
    viewportManager,
    pageStore,
    renderQueue,
    virtualizationEngine,
    onZoom
  }) {
    this.getScale = getScale;
    this.setScale = setScale;
    this.getFirstPage = getFirstPage;
    this.viewportManager = viewportManager;
    this.pageStore = pageStore;
    this.renderQueue = renderQueue;
    this.virtualizationEngine = virtualizationEngine;
    this.onZoom = onZoom;
    this.pendingScale = null;
    this.frame = null;
    this.previewScaleValue = 1;
  }

  setScaleAndInvalidate(nextScale) {
    this.pendingScale = Math.min(Math.max(nextScale, 0.45), 4);

    if (this.frame) return;

    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.setScale(this.pendingScale);
      this.renderQueue?.cancelAll();
      this.pageStore.forEach((item) => {
        if (item.page) {
          this.viewportManager.applyPageSize(item);
        }
        item.renderedScale = 0;
        item.renderedRotation = null;
        item.renderVersion += 1;
        if (this.virtualizationEngine?.shouldRender(item.pageNumber)) {
          item.shell.classList.add("rerendering");
        }
      });
      this.virtualizationEngine?.rerenderVisible();
      this.onZoom?.();
    });
  }

  change(delta) {
    this.setScaleAndInvalidate(this.getScale() + delta);
  }

  previewScale(nextScale) {
    const clamped = Math.min(Math.max(nextScale, 0.45), 4);
    this.previewScaleValue = clamped / this.getScale();

    this.pageStore.forEach((item) => {
      if (!this.virtualizationEngine?.shouldRender(item.pageNumber)) return;
      if (!item.shell.classList.contains("rendered")) return;
      item.shell.style.setProperty("--zoom-preview-scale", this.previewScaleValue);
      item.shell.classList.add("zoom-preview");
    });

    this.onZoom?.(clamped);
    return clamped;
  }

  clearPreview() {
    this.pageStore.forEach((item) => {
      item.shell.classList.remove("zoom-preview");
      item.shell.style.removeProperty("--zoom-preview-scale");
    });
  }

  commitPreviewScale(nextScale) {
    this.clearPreview();
    this.setScaleAndInvalidate(nextScale);
  }

  fitWidth() {
    const firstPage = this.getFirstPage();
    if (!firstPage) return;
    this.viewportManager.fitWidth(firstPage);
    this.setScaleAndInvalidate(this.getScale());
  }

  fitPage() {
    const firstPage = this.getFirstPage();
    if (!firstPage) return;
    this.viewportManager.fitPage(firstPage);
    this.setScaleAndInvalidate(this.getScale());
  }
}
