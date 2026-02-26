type DeduperConfig = {
  capacity?: number;
  maxAgeMs?: number;
};

type Entry = {
  key: string;
  seenAt: number;
};

export class RecentTradeDeduper {
  private readonly capacity: number;
  private readonly maxAgeMs: number;
  private readonly entries = new Map<string, number>();
  private readonly queue: Entry[] = [];

  constructor(config: DeduperConfig = {}) {
    this.capacity = config.capacity ?? 50_000;
    this.maxAgeMs = config.maxAgeMs ?? 120_000;
  }

  reset() {
    this.entries.clear();
    this.queue.length = 0;
  }

  has(key: string, nowMs = Date.now()) {
    this.prune(nowMs);
    return this.entries.has(key);
  }

  hasOrRemember(key: string, nowMs: number) {
    this.prune(nowMs);

    if (this.entries.has(key)) {
      return true;
    }

    this.entries.set(key, nowMs);
    this.queue.push({ key, seenAt: nowMs });
    this.prune(nowMs);
    return false;
  }

  private prune(nowMs: number) {
    while (this.queue.length > 0) {
      const head = this.queue[0];
      if (!head) {
        break;
      }

      const tooOld = nowMs - head.seenAt > this.maxAgeMs;
      const overCapacity = this.entries.size > this.capacity;
      if (!tooOld && !overCapacity) {
        break;
      }

      this.queue.shift();
      const currentSeenAt = this.entries.get(head.key);
      if (currentSeenAt === head.seenAt) {
        this.entries.delete(head.key);
      }
    }
  }
}
