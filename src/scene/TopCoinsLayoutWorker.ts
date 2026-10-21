import type { TopCoinsLayoutNode, TopCoinsLayoutResult } from './topCoinsLayout';

/** Deduplicate overlapping React effects and keep the unchanged solver off the render thread. */
export class TopCoinsLayoutWorker {
  private worker: Worker | null = null;
  private serial = 0;
  private lastKey = '';
  private lastResult: Promise<TopCoinsLayoutResult> | null = null;
  private pending = new Map<number, { resolve: (result: TopCoinsLayoutResult) => void; reject: (error: Error) => void }>();
  solve = (nodes: TopCoinsLayoutNode[], hasExisting: boolean) => {
    const key = JSON.stringify([nodes, hasExisting]);
    if (this.lastKey === key && this.lastResult) return this.lastResult;
    if (!this.worker) {
      this.worker = new Worker(new URL('./topCoinsLayout.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent<{ id: number; result: TopCoinsLayoutResult }>) => {
        this.pending.get(event.data.id)?.resolve(event.data.result);
        this.pending.delete(event.data.id);
      };
      this.worker.onerror = (event) => {
        this.worker?.terminate();
        this.worker = null;
        for (const request of this.pending.values()) request.reject(new Error(event.message));
        this.pending.clear();
        this.lastKey = '';
        this.lastResult = null;
      };
    }
    this.lastKey = key;
    this.lastResult = new Promise<TopCoinsLayoutResult>((resolve, reject) => {
      const id = ++this.serial;
      this.pending.set(id, { resolve, reject });
      this.worker!.postMessage({ id, nodes, hasExisting });
    });
    return this.lastResult;
  };
  stop() {
    this.worker?.terminate();
    this.worker = null;
    for (const request of this.pending.values()) request.reject(new DOMException('City unmounted', 'AbortError'));
    this.pending.clear();
    this.lastKey = '';
    this.lastResult = null;
  }
}
