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
  }

  setScaleAndInvalidate(nextScale) {
    this.pendingScale = Math.min(Math.max(nextScale, 0.45), 4);

    if (this.frame) return;

    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.setScale(this.pendingScale);
      this.renderQueue?.cancelAll();
      this.pageStore.forEach((item) => {
        this.viewportManager.applyPageSize(item);
        item.renderedScale = 0;
        item.renderedRotation = null;
        item.renderVersion += 1;
      });
      this.virtualizationEngine?.rerenderVisible();
      this.onZoom?.();
    });
  }

  change(delta) {
    this.setScaleAndInvalidate(this.getScale() + delta);
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
