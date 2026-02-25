import { BtcSpotCityScene } from './scene/BtcSpotCityScene';
import { useBtcSpotCityDataEngine } from './hooks/useBtcSpotCityDataEngine';
import { BtcSpotCityOverlay } from './ui/BtcSpotCityOverlay';

export default function App() {
  useBtcSpotCityDataEngine();
  return (
    <>
      <BtcSpotCityScene />
      <BtcSpotCityOverlay />
    </>
  );
}
