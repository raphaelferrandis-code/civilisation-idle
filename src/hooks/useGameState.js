import { useState, useEffect, useRef } from 'react';
import { subscribe, state } from '../game/core/state.js';

// Shallow comparison helper
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
  const [, forceUpdate] = useState({});
  const selectorRef = useRef(selector);
  const selectedStateRef = useRef(null);

  // Keep selector updated
  selectorRef.current = selector;

  // Initialize selected state on first run
  if (selectedStateRef.current === null) {
    selectedStateRef.current = selector(state);
  }

  useEffect(() => {
    const checkUpdate = () => {
      try {
        const nextState = selectorRef.current(state);
        // If selectedState is an object/array, do shallow comparison
        const equal = typeof nextState === 'object' && nextState !== null
          ? shallowEqual(selectedStateRef.current, nextState)
          : Object.is(selectedStateRef.current, nextState);

        if (!equal) {
          selectedStateRef.current = nextState;
          forceUpdate({}); // Force re-render
        }
      } catch (err) {
        console.error("Error in useGameState selector:", err);
      }
    };

    // Check immediately in case state changed before subscription run
    checkUpdate();

    return subscribe(checkUpdate);
  }, []);

  return selectedStateRef.current;
}
