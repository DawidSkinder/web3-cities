/** Stable broad-phase candidates; callers retain their exact distance/collision rules. */
export class SpatialIndex<T> {
  private readonly cells = new Map<string, Array<{ value: T; order: number }>>();
  private nextOrder = 0;
  constructor(private readonly cellSize = 24) {}
  clear() { this.cells.clear(); this.nextOrder = 0; }
  add(value: T, x: number, z: number) {
    const key = `${Math.floor(x / this.cellSize)}:${Math.floor(z / this.cellSize)}`;
    const cell = this.cells.get(key) ?? [];
    cell.push({ value, order: this.nextOrder++ });
    this.cells.set(key, cell);
  }
  query(x: number, z: number, radius: number): T[] {
    const entries: Array<{ value: T; order: number }> = [];
    for (let ix = Math.floor((x - radius) / this.cellSize); ix <= Math.floor((x + radius) / this.cellSize); ix++) {
      for (let iz = Math.floor((z - radius) / this.cellSize); iz <= Math.floor((z + radius) / this.cellSize); iz++) {
        const cell = this.cells.get(`${ix}:${iz}`);
        if (cell) entries.push(...cell);
      }
    }
    entries.sort((a, b) => a.order - b.order);
    return entries.map((entry) => entry.value);
  }
}
