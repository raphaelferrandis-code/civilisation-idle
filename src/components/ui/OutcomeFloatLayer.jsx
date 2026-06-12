import { useEffect, useState } from 'react';
import { registerOutcomeFloats } from '../../game/core/outcomeFloat.js';

export default function OutcomeFloatLayer() {
  const [floats, setFloats] = useState([]);

  useEffect(() => {
    let nextId = 0;
    const timers = new Set();
    const unregister = registerOutcomeFloats((outcome) => {
      const id = ++nextId;
      setFloats((current) => [...current, { ...outcome, id }]);
      const timer = setTimeout(() => {
        timers.delete(timer);
        setFloats((current) => current.filter((f) => f.id !== id));
      }, 2400);
      timers.add(timer);
    });
    return () => {
      unregister();
      for (const timer of timers) clearTimeout(timer);
    };
  }, []);

  if (!floats.length) return null;

  return (
    <div className="outcome-float-layer" role="status" aria-live="polite">
      {floats.map((f) => (
        <span key={f.id} className={`outcome-float is-${f.kind || "info"}`}>{f.label}</span>
      ))}
    </div>
  );
}
