import { useMemo } from 'react';
import { useCitySceneStore } from '../scene/citySceneStore';

const compactNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const compactVolume = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 2
});

function formatVolume(value: number) {
  if (!Number.isFinite(value)) return '0';
  return compactVolume.format(Math.max(0, value));
}

function formatHeight(value: number) {
  if (!Number.isFinite(value)) return '0';
  return compactNumber.format(Math.max(0, value));
}

function formatIntensity(value: number) {
  if (!Number.isFinite(value)) return '0.00';
  return Math.max(0, Math.min(1, value)).toFixed(2);
}

export function BtcSpotCityOverlay() {
  const { hoveredInfo } = useCitySceneStore();

  const hoverRows = useMemo(() => {
    if (!hoveredInfo) {
      return [];
    }

    return [
      { label: 'Building', value: hoveredInfo.buildingId },
      { label: 'District', value: hoveredInfo.districtId },
      { label: 'Tier', value: hoveredInfo.tier },
      { label: 'Height', value: `${formatHeight(hoveredInfo.totalHeight)} u` },
      { label: 'Buy Vol', value: formatVolume(hoveredInfo.buyVolume) },
      { label: 'Sell Vol', value: formatVolume(hoveredInfo.sellVolume) },
      { label: 'Intensity', value: formatIntensity(hoveredInfo.intensity) },
      { label: 'Seq', value: String(hoveredInfo.sequence) }
    ];
  }, [hoveredInfo]);

  return (
    <div className="btc-overlay" aria-hidden="true">
      <div className="btc-overlay__panel btc-overlay__legend">
        <div className="btc-overlay__title">Camera</div>
        <div className="btc-overlay__row">
          <span>Drag</span>
          <span>orbit</span>
        </div>
        <div className="btc-overlay__row">
          <span>Scroll</span>
          <span>zoom</span>
        </div>
        <div className="btc-overlay__row">
          <span>W / S</span>
          <span>tilt</span>
        </div>
        <div className="btc-overlay__row">
          <span>A / D</span>
          <span>orbit</span>
        </div>
        <div className="btc-overlay__row">
          <span>Q / E</span>
          <span>zoom</span>
        </div>
        <div className="btc-overlay__row">
          <span>R</span>
          <span>reset</span>
        </div>
        <div className="btc-overlay__hint">Idle = cinematic mode</div>
      </div>

      <div className="btc-overlay__stack">
        {hoveredInfo ? (
          <div className="btc-overlay__panel btc-overlay__hover">
            <div className="btc-overlay__title">Structure</div>
            {hoverRows.map((row) => (
              <div key={`${row.label}-${row.value}`} className="btc-overlay__row">
                <span>{row.label}</span>
                <span>{row.value}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
