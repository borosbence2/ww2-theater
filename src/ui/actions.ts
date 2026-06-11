// Shared select-and-go actions: set the store selection, jump the timeline
// into the thing's lifespan when needed, and fly the camera. Used by the
// omnibox results and the People panel's find-their-unit wizard.

import { loadUnitTracks, positionOn, type UnitIndexEntry } from '../data/units';
import type { Battle } from '../data/battles';
import type { City } from '../data/cities';
import { dateToNum } from '../time/dates';
import { getMap } from '../map/mapRef';
import { useStore } from '../store';

export function selectCity(city: City): void {
  useStore.getState().setSelection({ kind: 'city', id: city.name });
  const map = getMap();
  map?.flyTo({ center: [city.lng, city.lat], zoom: Math.max(map.getZoom(), 5.5) });
}

export function selectBattle(battle: Battle): void {
  const { setSelection, date, setDate } = useStore.getState();
  setSelection({ kind: 'battle', id: battle.id });
  const d = dateToNum(date);
  if (d < battle.startNum || d > battle.endNum) setDate(battle.start);
  const map = getMap();
  map?.flyTo({ center: [battle.lon, battle.lat], zoom: Math.max(map.getZoom(), 5.5) });
}

export async function selectUnit(unit: UnitIndexEntry): Promise<void> {
  const { setSelection } = useStore.getState();
  setSelection({ kind: 'unit', id: unit.id });
  const map = getMap();

  if (unit.hasPositions) {
    const track = (await loadUnitTracks()).find((t) => t.id === unit.id);
    if (!track) return;
    const { date, setDate } = useStore.getState();
    let when = date;
    if (!positionOn(track, date, dateToNum(date))) {
      // Jump the timeline to the unit's first mapped day.
      when = track.keyframes[0].date;
      setDate(when);
    }
    const at = positionOn(track, when, dateToNum(when));
    if (at) map?.flyTo({ center: at, zoom: Math.max(map.getZoom(), 6.3) });
    return;
  }

  if (unit.hasDerived) {
    // Sector-derived: resolve via the units layer's front-line state.
    const { firstDerivedDate, getUnitPositionOn } = await import('../layers/units');
    const { date, setDate } = useStore.getState();
    let when = date;
    if (!getUnitPositionOn(unit.id, when)) {
      const first = firstDerivedDate(unit.id);
      if (!first) return;
      when = first;
      setDate(when);
    }
    const at = getUnitPositionOn(unit.id, when);
    if (at) map?.flyTo({ center: at, zoom: Math.max(map.getZoom(), 6) });
  }
}
