import { getCryptoCityPreset } from '../data/cryptoCity/presets';
import type { CryptoCityMode } from '../lib/cityMode';
import type { CityMode } from '../lib/cityMode';
import { isCryptoCityMode } from '../lib/cityMode';
import { BtcSpotBuysSandbox } from './BtcSpotBuysSandbox';
import { TopCoinsSkylineSandbox } from './TopCoinsSkylineSandbox';

export function BtcSpotCityScene({
  mode,
  cryptoSelection,
  onModeChange
}: {
  mode: CityMode;
  cryptoSelection: CryptoCityMode;
  onModeChange?: (nextMode: CityMode) => void;
}) {
  if (isCryptoCityMode(mode)) {
    return (
      <BtcSpotBuysSandbox
        mode={mode}
        preset={getCryptoCityPreset(mode)}
        cryptoSelection={cryptoSelection}
        onModeChange={onModeChange}
      />
    );
  }
  return <TopCoinsSkylineSandbox cryptoSelection={cryptoSelection} onModeChange={onModeChange} />;
}
