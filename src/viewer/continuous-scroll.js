export class ContinuousScroll {
  constructor({ container, getViewMode }) {
    this.container = container;
    this.getViewMode = getViewMode;
  }

  scrollToPage(item) {
    if (!item) return;

    item.shell.scrollIntoView({
      behavior: "smooth",
      block: this.getViewMode() === "horizontal" ? "nearest" : "start",
      inline: this.getViewMode() === "horizontal" ? "start" : "nearest"
    });
  }

  setMode(mode) {
    this.container.dataset.viewMode = mode;
  }
}
