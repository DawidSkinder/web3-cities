import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { loadTypescript } from './load-typescript.mjs';

const { RecentTradeDeduper } = loadTypescript('src/data/trades/RecentTradeDeduper.ts');
test('dedupe preserves TTL, capacity, duplicate and reset semantics over a long burst', () => {
  const capacity = 500, ttl = 1000;
  const dedupe = new RecentTradeDeduper({ capacity, maxAgeMs: ttl });
  const model = new Map();
  for (let i = 0; i < 40_000; i++) {
    const now = Math.floor(i / 3), key = `trade:${(i * 17) % 1300}`;
    for (const [entry, seen] of model) if (now - seen > ttl) model.delete(entry); else break;
    const expected = model.has(key);
    if (!expected) model.set(key, now);
    while (model.size > capacity) model.delete(model.keys().next().value);
    assert.equal(dedupe.hasOrRemember(key, now), expected);
    if (i % 113 === 0) assert.equal(dedupe.has('trade:17', now), model.has('trade:17'));
  }
  dedupe.reset();
  assert.equal(dedupe.hasOrRemember('again', 0), false);
  assert.equal(dedupe.has('again', ttl), true);
  assert.equal(dedupe.has('again', ttl + 1), false);
});

const { SpatialIndex } = loadTypescript('src/scene/SpatialIndex.ts');
test('spatial broad phase returns the same exact local neighbors in original insertion order', () => {
  const index = new SpatialIndex(16), points = [];
  for (let i = 0; i < 2500; i++) {
    const point = { id: i, x: Math.sin(i * 17.3) * 300, z: Math.cos(i * 7.1) * 300 };
    points.push(point); index.add(point, point.x, point.z);
  }
  for (let i = 0; i < 200; i++) {
    const x = Math.sin(i * 4.2) * 300, z = Math.cos(i * 1.7) * 300, r = 1 + i % 40;
    const inside = (p) => Math.hypot(p.x - x, p.z - z) <= r;
    assert.deepEqual(Array.from(index.query(x, z, r).filter(inside), p => p.id), points.filter(inside).map(p => p.id));
  }
  index.clear();
  assert.equal(index.query(0, 0, 1000).length, 0);
});

const { createFrameStore } = loadTypescript('src/scene/frameStore.ts');
test('frame store notifies only its subscribers and releases them on unmount', () => {
  const initial = {}, store = createFrameStore(initial); let calls = 0;
  const stop = store.subscribe(() => calls++);
  store.set(initial); assert.equal(calls, 0);
  const next = { x: 2 }; store.set(next);
  assert.equal(store.getSnapshot(), next); assert.equal(calls, 1);
  stop(); store.set({ x: 3 }); assert.equal(calls, 1);
});

test('one inactivity timer preserves the exact deadline after a stream of trades', () => {
  let now = 1000, serial = 0, scheduled = 0, closed = 0;
  const timers = new Map();
  const window = {
    setTimeout(fn, delay) { const id = ++serial; timers.set(id, { fn, at: now + delay }); scheduled++; return id; },
    clearTimeout(id) { timers.delete(id); }
  };
  class MockDate extends Date { static now() { return now; } }
  class Socket {
    static latest;
    constructor() { Socket.latest = this; }
    close() { closed++; this.onclose?.({ code: 1000, reason: '' }); }
  }
  function runTo(target) {
    while (true) {
      const next = [...timers].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at; timers.delete(next[0]); next[1].fn();
    }
    now = target;
  }
  const { BinanceTradeFeed } = loadTypescript('src/data/trades/BinanceTradeFeed.ts', { window, Date: MockDate, WebSocket: Socket });
  const feed = new BinanceTradeFeed({ symbol: 'BTCUSDT' });
  let trades = 0;
  feed.start({ onTrade() { trades++; }, onStatus() {} });
  const socket = Socket.latest; socket.onopen();
  for (let i = 0; i < 1000; i++) {
    now = 1000 + i * 10;
    socket.onmessage({ data: JSON.stringify({ e: 'trade', s: 'BTCUSDT', t: i, p: '60000', q: '0.1', T: now, m: false }) });
  }
  assert.equal(trades, 1000); assert.equal(scheduled, 1);
  const deadline = now + 15000;
  runTo(deadline - 1); assert.equal(closed, 0);
  runTo(deadline); assert.equal(closed, 1);
  feed.stop(); assert.equal(timers.size, 0);
});

const { solveTopCoinsLayout } = loadTypescript('src/scene/topCoinsLayout.ts');
for (const fixture of JSON.parse(fs.readFileSync('tests/fixtures/market-layout.json', 'utf8'))) {
  test(`worker solver preserves original layout: ${fixture.name}`, () => {
    const result = solveTopCoinsLayout(structuredClone(fixture.nodes), fixture.hasExisting);
    assert.equal(result.layoutIters, fixture.result.layoutIters);
    assert.equal(result.overlapFix, fixture.result.overlapFix);
    assert.ok(Math.abs(result.cityRadius - fixture.result.cityRadius) < 1e-10);
    for (const [symbol, target] of fixture.result.targets) {
      const actual = result.targets.get(symbol);
      assert.equal(actual.districtId, target.districtId);
      assert.ok(Math.abs(actual.x - target.x) < 1e-10, symbol + ' x');
      assert.ok(Math.abs(actual.z - target.z) < 1e-10, symbol + ' z');
    }
  });
}
