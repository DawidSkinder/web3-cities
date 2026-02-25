function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function logistic(x: number) {
  return 1 / (1 + Math.exp(-x));
}

export class RollingIntensityNormalizer {
  private readonly capacity: number;
  private readonly values: number[] = [];
  private sum = 0;
  private sumSquares = 0;

  constructor(capacity = 90) {
    this.capacity = capacity;
  }

  normalize(rawValue: number) {
    const stats = this.getStats();
    let normalized = 0.5;

    if (stats.count >= 8 && stats.stdDev > 1e-6) {
      const z = (rawValue - stats.mean) / stats.stdDev;
      normalized = logistic(z);
    } else if (stats.count > 0 && stats.mean > 1e-6) {
      normalized = clamp(rawValue / (stats.mean * 2), 0, 1);
    } else if (rawValue > 0) {
      normalized = clamp(rawValue / (rawValue + 4), 0, 1);
    }

    this.push(rawValue);
    return normalized;
  }

  private push(value: number) {
    this.values.push(value);
    this.sum += value;
    this.sumSquares += value * value;

    if (this.values.length > this.capacity) {
      const removed = this.values.shift() ?? 0;
      this.sum -= removed;
      this.sumSquares -= removed * removed;
    }
  }

  private getStats() {
    const count = this.values.length;
    if (count === 0) {
      return { count: 0, mean: 0, variance: 0, stdDev: 0 };
    }

    const mean = this.sum / count;
    const variance = Math.max(0, this.sumSquares / count - mean * mean);

    return {
      count,
      mean,
      variance,
      stdDev: Math.sqrt(variance)
    };
  }
}

