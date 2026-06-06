import { useEffect, useState } from 'react';
import { subscribe, state } from '../game/core/state.js';

export function useGameState(selector) {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    return subscribe(() => forceUpdate((revision) => revision + 1));
  }, []);

  return selector(state);
}
