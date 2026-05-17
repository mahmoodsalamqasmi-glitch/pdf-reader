export class RenderQueue {
  constructor({ renderPage, shouldRender, maxConcurrent = 2 }) {
    this.renderPage = renderPage;
    this.shouldRender = shouldRender || (() => true);
    this.maxConcurrent = maxConcurrent;
    this.queue = [];
    this.running = new Set();
    this.tasks = new Map();
    this.scheduled = false;
    this.generation = 0;
  }

  setTask(pageNumber, task) {
    this.tasks.set(pageNumber, task);
  }

  deleteTask(pageNumber) {
    this.tasks.delete(pageNumber);
  }

  cancel(pageNumber) {
    const task = this.tasks.get(pageNumber);
    task?.cancel?.();
    this.tasks.delete(pageNumber);
    this.queue = this.queue.filter((entry) => entry.pageNumber !== pageNumber);
    this.running.delete(pageNumber);
  }

  cancelAll() {
    this.tasks.forEach((task) => task.cancel?.());
    this.tasks.clear();
    this.queue = [];
    this.running.clear();
  }

  invalidate() {
    this.generation += 1;
    this.cancelAll();
    return this.generation;
  }

  enqueue(pageNumber, priority = 0) {
    if (!this.shouldRender(pageNumber)) return;
    if (this.running.has(pageNumber)) return;

    const existing = this.queue.find((entry) => entry.pageNumber === pageNumber);
    if (existing) {
      existing.priority = Math.max(existing.priority, priority);
    } else {
      this.queue.push({ pageNumber, priority, queuedAt: performance.now(), generation: this.generation });
    }

    this.queue.sort((a, b) => b.priority - a.priority || a.queuedAt - b.queuedAt);
    this.schedule();
  }

  schedule() {
    if (this.scheduled) return;
    this.scheduled = true;
    requestAnimationFrame(() => {
      this.scheduled = false;
      this.drain();
    });
  }

  drain() {
    while (this.running.size < this.maxConcurrent && this.queue.length > 0) {
      const next = this.queue.shift();
      if (next.generation !== this.generation) {
        continue;
      }
      if (!this.shouldRender(next.pageNumber)) {
        continue;
      }
      this.running.add(next.pageNumber);
      this.renderPage(next.pageNumber, next.generation)
        .catch((error) => {
          if (error?.name !== "RenderingCancelledException") {
            console.error(error);
          }
        })
        .finally(() => {
          this.running.delete(next.pageNumber);
          this.schedule();
        });
    }
  }
}
