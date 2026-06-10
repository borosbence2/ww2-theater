import { MapView } from './map/MapView';
import { TimeBar } from './ui/TimeBar';
import { Omnibox } from './ui/Omnibox';
import { LayerPanel } from './ui/LayerPanel';
import { DetailPanel } from './ui/DetailPanel';
import { PeoplePanel } from './ui/PeoplePanel';
import { useUrlSync } from './time/useUrlSync';
import { useStore } from './store';
import { EDIT_MODE } from './edit/mode';
import { EditPanel } from './edit/EditPanel';

export default function App() {
  useUrlSync();
  const peopleOpen = useStore((s) => s.peopleOpen);
  const setPeopleOpen = useStore((s) => s.setPeopleOpen);

  return (
    <div className="app">
      <MapView />
      <header className="title-overlay">
        <h1>WWII European Theater</h1>
        <p>Day by day · 1939–1945</p>
      </header>
      <Omnibox />
      <button
        className={`people-button${peopleOpen ? ' active' : ''}`}
        title="Find a person (federated archive search)"
        onClick={() => setPeopleOpen(!peopleOpen)}
      >
        People
      </button>
      <LayerPanel />
      <DetailPanel />
      <PeoplePanel />
      {EDIT_MODE && <EditPanel />}
      <TimeBar />
    </div>
  );
}
