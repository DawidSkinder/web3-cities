import type { CityMode } from '../lib/cityMode';
import { BtcSpotBuysSandbox } from './BtcSpotBuysSandbox';
import { TopCoinsSkylineSandbox } from './TopCoinsSkylineSandbox';

export function BtcSpotCityScene({
  mode,
  onModeChange
}: {
  mode: CityMode;
  onModeChange?: (nextMode: CityMode) => void;
}) {
  if (mode === 'btc') {
    return <BtcSpotBuysSandbox onModeChange={onModeChange} />;
  }
  return <TopCoinsSkylineSandbox onModeChange={onModeChange} />;
}
