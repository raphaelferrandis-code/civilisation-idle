import { useSyncExternalStore, useRef } from 'react';
import { subscribe, state } from '../game/core/state.js';

// Shallow comparison helper to prevent unnecessary re-renders of object/array selectors
function shallowEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;
  
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  
  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i];
    if (!Object.prototype.hasOwnProperty.call(b, key) || !Object.is(a[key], b[key])) {
      return false;
    }
  }
  return true;
}

export function useGameState(selector) {
  const initializedRef = useRef(false);
  const lastValueRef = useRef(null);

  const getSnapshot = () => {
    const nextValue = selector(state);

    if (!initializedRef.current) {
      initializedRef.current = true;
      lastValueRef.current = nextValue;
      return nextValue;
    }

    const equal = typeof nextValue === 'object' && nextValue !== null
      ? shallowEqual(lastValueRef.current, nextValue)
      : Object.is(lastValueRef.current, nextValue);

    if (equal) {
      return lastValueRef.current;
    } else {
      lastValueRef.current = nextValue;
      return nextValue;
    }
  };

  return useSyncExternalStore(subscribe, getSnapshot);
}
