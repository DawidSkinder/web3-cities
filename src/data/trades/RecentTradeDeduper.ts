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
  private queueHead = 0;

  constructor(config: DeduperConfig = {}) {
    this.capacity = config.capacity ?? 50_000;
    this.maxAgeMs = config.maxAgeMs ?? 120_000;
  }

  reset() {
    this.entries.clear();
    this.queue.length = 0;
    this.queueHead = 0;
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
    while (this.queueHead < this.queue.length) {
      const head = this.queue[this.queueHead];
      if (!head) {
        break;
      }

      const tooOld = nowMs - head.seenAt > this.maxAgeMs;
      const overCapacity = this.entries.size > this.capacity;
      if (!tooOld && !overCapacity) {
        break;
      }

      this.queueHead += 1;
      const currentSeenAt = this.entries.get(head.key);
      if (currentSeenAt === head.seenAt) {
        this.entries.delete(head.key);
      }
    }
    if (this.queueHead > 4096 && this.queueHead * 2 >= this.queue.length) {
      this.queue.splice(0, this.queueHead);
      this.queueHead = 0;
    }
  }
}
