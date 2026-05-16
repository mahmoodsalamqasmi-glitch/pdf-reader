export class ViewportManager {
  constructor({
    getScale,
    setScale,
    getRotation,
    getContainer,
    getReadingMode
  }) {
    this.getScale = getScale;
    this.setScale = setScale;
    this.getRotation = getRotation;
    this.getContainer = getContainer;
    this.getReadingMode = getReadingMode;
  }

  viewport(page, scale = this.getScale()) {
    return page.getViewport({
      scale,
      rotation: this.getRotation()
    });
  }

  outputScale() {
    const isMobile = window.matchMedia("(max-width: 860px)").matches;
    const maxScale = isMobile ? 2 : 3;
    return Math.min(window.devicePixelRatio || 1, maxScale);
  }

  applyPageSize(item, scale = this.getScale()) {
    const viewport = this.viewport(item.page, scale);
    item.shell.style.width = `${viewport.width}px`;
    item.shell.style.height = `${viewport.height}px`;
    return viewport;
  }

  fitWidth(firstPage) {
    const isMobile = window.matchMedia("(max-width: 860px)").matches;
    const viewport = this.viewport(firstPage, 1);
    const container = this.getContainer();
    const available = this.getReadingMode()
      ? Math.max(window.innerWidth - (isMobile ? 24 : 80), 300)
      : Math.max(container.clientWidth - (isMobile ? 12 : 32), 300);
    const nextScale = Math.min(Math.max(available / viewport.width, 0.45), 4);
    this.setScale(nextScale);
    return nextScale;
  }

  fitPage(firstPage) {
    const isMobile = window.matchMedia("(max-width: 860px)").matches;
    const viewport = this.viewport(firstPage, 1);
    const scaleX = Math.max(window.innerWidth - (isMobile ? 24 : 80), 300) / viewport.width;
    const scaleY = Math.max(window.innerHeight - (isMobile ? 170 : 220), 300) / viewport.height;
    const nextScale = Math.min(Math.max(Math.min(scaleX, scaleY), 0.45), 4);
    this.setScale(nextScale);
    return nextScale;
  }
}
