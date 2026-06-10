import { MapView } from './map/MapView';
import { TimeBar } from './ui/TimeBar';
import { Omnibox } from './ui/Omnibox';
import { LayerPanel } from './ui/LayerPanel';
import { DetailPanel } from './ui/DetailPanel';
import { useUrlSync } from './time/useUrlSync';
import { EDIT_MODE } from './edit/mode';
import { EditPanel } from './edit/EditPanel';

export default function App() {
  useUrlSync();

  return (
    <div className="app">
      <MapView />
      <header className="title-overlay">
        <h1>WWII European Theater</h1>
        <p>Day by day · 1939–1945</p>
      </header>
      <Omnibox />
      <LayerPanel />
      <DetailPanel />
      {EDIT_MODE && <EditPanel />}
      <TimeBar />
    </div>
  );
}
