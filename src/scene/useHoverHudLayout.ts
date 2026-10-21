import { useLayoutEffect, useRef } from 'react';
import type { createFrameStore } from './frameStore';
type HudPosition = { visible: boolean; towerSequence: number | null; labelX: number; labelY: number; anchorX: number; anchorY: number };

/** Preserve the authored HUD geometry while moving its DOM without React reconciliation. */
export function useHoverHudLayout<T extends HudPosition>(store: ReturnType<typeof createFrameStore<T>>, sequence: number | null, width: number, height: number) {
  const root = useRef<HTMLDivElement>(null), label = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLDivElement>(null), anchor = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const update = () => {
      const hud = store.getSnapshot();
      if (!root.current) return;
      root.current.style.display = hud.visible && hud.towerSequence === sequence ? '' : 'none';
      if (label.current) { label.current.style.left = `${hud.labelX}px`; label.current.style.top = `${hud.labelY}px`; }
      const x = hud.labelX + width * 0.5;
      const y = hud.labelY > hud.anchorY ? hud.labelY : hud.labelY + height;
      if (line.current) {
        line.current.style.left = `${x}px`; line.current.style.top = `${y}px`;
        line.current.style.width = `${Math.max(6, Math.hypot(hud.anchorX - x, hud.anchorY - y))}px`;
        line.current.style.transform = `rotate(${Math.atan2(hud.anchorY - y, hud.anchorX - x)}rad)`;
      }
      if (anchor.current) { anchor.current.style.left = `${hud.anchorX - 3}px`; anchor.current.style.top = `${hud.anchorY - 3}px`; }
    };
    update();
    return store.subscribe(update);
  }, [store, sequence, width, height]);
  return { root, label, line, anchor };
}
