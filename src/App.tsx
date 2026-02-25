import { BtcSpotCityScene } from './scene/BtcSpotCityScene';
import { useBtcSpotCityDataEngine } from './hooks/useBtcSpotCityDataEngine';

export default function App() {
  useBtcSpotCityDataEngine();
  return <BtcSpotCityScene />;
}
