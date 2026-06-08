import { state, defaultState, setState } from '../src/game/core/state.js';
import { timeWearRate, ruinEffectMultiplier } from '../src/game/core/mechanics.js';

setState(defaultState());

console.log("=== DEFAULT STATE TIME WEAR RATE ===");
console.log("state.cycles:", state.cycles);
console.log("state.population:", state.population);
console.log("state.infrastructure:", state.infrastructure);
console.log("state.knowledge:", state.knowledge);
console.log("state.legitimacy:", state.legitimacy);
console.log("ruinEffectMultiplier('timeWearSlow'):", ruinEffectMultiplier("timeWearSlow"));
console.log("timeWearRate():", timeWearRate());
console.log("Seconds to reach 1.0 wear:", 1 / timeWearRate());
console.log("Minutes to reach 1.0 wear:", (1 / timeWearRate()) / 60);
