import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { LocationTarget, SelectedLocation } from '../../src/location/types';

interface LocationSelectionValue {
  pickup: SelectedLocation | null;
  drop: SelectedLocation | null;
  selectLocation: (target: LocationTarget, location: SelectedLocation) => void;
  clearLocation: (target: LocationTarget) => void;
  swapLocations: () => void;
}

const LocationSelectionContext = createContext<LocationSelectionValue | null>(null);

export function LocationSelectionProvider({ children }: { children: ReactNode }) {
  const [pickup, setPickup] = useState<SelectedLocation | null>(null);
  const [drop, setDrop] = useState<SelectedLocation | null>(null);
  const value = useMemo<LocationSelectionValue>(
    () => ({
      pickup,
      drop,
      selectLocation: (target, location) => {
        if (target === 'pickup') setPickup(location);
        else setDrop(location);
      },
      clearLocation: (target) => {
        if (target === 'pickup') setPickup(null);
        else setDrop(null);
      },
      swapLocations: () => {
        setPickup(drop);
        setDrop(pickup);
      },
    }),
    [drop, pickup],
  );

  return (
    <LocationSelectionContext.Provider value={value}>
      {children}
    </LocationSelectionContext.Provider>
  );
}

export function useLocationSelection(): LocationSelectionValue {
  const context = useContext(LocationSelectionContext);
  if (!context) {
    throw new Error('useLocationSelection must be used within LocationSelectionProvider.');
  }
  return context;
}
