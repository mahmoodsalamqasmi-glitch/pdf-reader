export class VirtualizationEngine {
  constructor({
    pageStore,
    renderQueue,
    unloadPage,
    onActivePage,
    preloadMargin = 1100,
    keepPages = 2
  }) {
    this.pageStore = pageStore;
    this.renderQueue = renderQueue;
    this.unloadPage = unloadPage;
    this.onActivePage = onActivePage;
    this.preloadMargin = preloadMargin;
    this.keepPages = keepPages;
    this.visiblePages = new Set();
    this.activePage = 1;
    this.renderObserver = null;
    this.activeObserver = null;
    this.cleanupScheduled = false;
  }

  connect() {
    this.disconnect();

    this.renderObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const pageNumber = Number(entry.target.dataset.page);

        if (entry.isIntersecting) {
          this.visiblePages.add(pageNumber);
          this.enqueueWindow(pageNumber);
        } else {
          this.visiblePages.delete(pageNumber);
          this.scheduleCleanup();
        }
      });
    }, {
      rootMargin: `${this.preloadMargin}px 0px`,
      threshold: 0.01
    });

    this.activeObserver = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

      if (!visible) return;

      this.activePage = Number(visible.target.dataset.page);
      this.onActivePage(this.activePage);
    }, {
      threshold: [0.35, 0.55, 0.75]
    });

    this.pageStore.forEach((item) => {
      this.renderObserver.observe(item.shell);
      this.activeObserver.observe(item.shell);
    });
  }

  disconnect() {
    this.renderObserver?.disconnect();
    this.activeObserver?.disconnect();
    this.visiblePages.clear();
  }

  enqueueWindow(centerPage) {
    for (let offset = -this.keepPages; offset <= this.keepPages; offset += 1) {
      const pageNumber = centerPage + offset;
      if (!this.pageStore.get(pageNumber)) continue;
      const priority = offset === 0 ? 100 : 100 - Math.abs(offset);
      this.renderQueue.enqueue(pageNumber, priority);
    }
  }

  shouldRender(pageNumber) {
    if (this.visiblePages.has(pageNumber)) return true;

    for (const visiblePage of this.visiblePages) {
      if (Math.abs(visiblePage - pageNumber) <= this.keepPages) {
        return true;
      }
    }

    return Math.abs(this.activePage - pageNumber) <= this.keepPages;
  }

  scheduleCleanup() {
    if (this.cleanupScheduled) return;
    this.cleanupScheduled = true;
    requestAnimationFrame(() => {
      this.cleanupScheduled = false;
      this.cleanupFarPages();
    });
  }

  cleanupFarPages() {
    this.pageStore.forEach((item, pageNumber) => {
      if (!this.shouldRender(pageNumber)) {
        this.renderQueue.cancel(pageNumber);
        this.unloadPage(pageNumber);
      }
    });
  }

  rerenderVisible() {
    const pages = this.visiblePages.size > 0
      ? [...this.visiblePages]
      : [this.activePage];

    pages.forEach((pageNumber) => this.enqueueWindow(pageNumber));
    this.scheduleCleanup();
  }

  isNearViewport(shell) {
    const rect = shell.getBoundingClientRect();
    return rect.bottom > -this.preloadMargin && rect.top < window.innerHeight + this.preloadMargin;
  }
}
