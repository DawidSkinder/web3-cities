import { solveTopCoinsLayout, type TopCoinsLayoutNode } from './topCoinsLayout';
self.onmessage = (event: MessageEvent<{ id: number; nodes: TopCoinsLayoutNode[]; hasExisting: boolean }>) => {
  const { id, nodes, hasExisting } = event.data;
  self.postMessage({ id, result: solveTopCoinsLayout(nodes, hasExisting) });
};
