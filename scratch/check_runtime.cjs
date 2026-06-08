(async () => {
  try {
    const mod = await import('../src/game/map/legacyRuntime.js');
    console.log('legacyRuntime loaded successfully in ES module.');
  } catch (e) {
    console.error('Error loading legacyRuntime:', e.stack);
  }
})();
