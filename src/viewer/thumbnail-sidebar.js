export class ThumbnailSidebar {
  constructor({ container, getPdf, onPageSelect }) {
    this.container = container;
    this.getPdf = getPdf;
    this.onPageSelect = onPageSelect;
    this.cancelled = false;
    this.observer = null;
    this.rendered = new Set();
  }

  clear() {
    this.cancelled = true;
    this.observer?.disconnect();
    this.observer = null;
    this.rendered.clear();
    this.container.replaceChildren();
  }

  async render() {
    const pdf = this.getPdf();
    if (!pdf) return;

    this.cancelled = false;
    this.rendered.clear();
    this.container.replaceChildren();
    this.observer?.disconnect();
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const canvas = entry.target.querySelector("canvas");
        const pageNumber = Number(entry.target.dataset.page);
        this.renderThumb(pdf, pageNumber, canvas);
      });
    }, {
      root: this.container,
      rootMargin: "240px 0px",
      threshold: 0.01
    });

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      if (this.cancelled) return;

      const button = document.createElement("button");
      button.className = "thumb";
      button.dataset.page = pageNumber;
      button.type = "button";

      const canvas = document.createElement("canvas");
      const label = document.createElement("span");
      label.textContent = `Page ${pageNumber}`;
      button.append(canvas, label);
      button.addEventListener("click", () => this.onPageSelect(pageNumber));
      this.container.append(button);
      this.observer.observe(button);
    }
  }

  async renderThumb(pdf, pageNumber, canvas) {
    if (this.rendered.has(pageNumber)) return;
    this.rendered.add(pageNumber);
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 0.16 });
    const outputScale = Math.min(window.devicePixelRatio || 1, 2);
    const context = canvas.getContext("2d", { alpha: false });

    canvas.width = Math.ceil(viewport.width * outputScale);
    canvas.height = Math.ceil(viewport.height * outputScale);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
    await page.render({ canvasContext: context, viewport }).promise;
  }

  sync(activePage) {
    this.container.querySelectorAll(".thumb").forEach((thumb) => {
      thumb.classList.toggle("active", Number(thumb.dataset.page) === activePage);
    });
  }
}
