import { upgrades } from '../src/game/data/upgrades.js';

const ruinsUpgrades = upgrades.filter(u => u.group === 'ruins');
console.log(`Total ruins upgrades: ${ruinsUpgrades.length}`);

const countByType = {};
ruinsUpgrades.forEach(u => {
  const type = u.effectType || 'special/dogma';
  countByType[type] = (countByType[type] || 0) + 1;
});

console.log('Distribution of effect types in ruins upgrades:');
console.log(JSON.stringify(countByType, null, 2));
