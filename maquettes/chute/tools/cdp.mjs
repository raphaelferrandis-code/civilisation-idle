// (repris de la session « arbre des ruines ») // Captures pleine résolution du jeu via Chrome headless + CDP (WebSocket natif de Node 24).
// Usage : node cdpShots.mjs <steps.json> [dossier-de-sortie]
// steps : [{nav:url} | {wait:ms} | {eval:js} | {shot:nom} | {size:[w,h]} | {click:[x,y]} | {key:"x"}]
// Le profil Chrome est PERSISTANT (localStorage = la partie) : une partie avancée
// construite une fois se réutilise d'un lancement à l'autre.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9371;
const PROFILE = process.env.CDP_PROFILE || 'C:/Users/HARDWA~1/AppData/Local/Temp/claude/C--Users-Hardware31-Desktop-Civilisation-idle-CE-0-3--claude-worktrees-elastic-snyder-a0be70/1428b87c-53a3-457d-b69f-81c8d7674039/scratchpad/chrome-prof-chute';
const steps = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const OUT = process.argv[3] || path.join(HERE, 'shots');
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  '--window-size=1600,900', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  '--force-device-scale-factor=1', 'about:blank',
], { stdio: 'ignore' });

let target = null;
for (let i = 0; i < 200 && !target; i++) {
  await sleep(250);
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    target = list.find((t) => t.type === 'page');
  } catch { /* pas encore prêt */ }
}
if (!target) { console.error('Chrome ne répond pas'); chrome.kill(); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
const listeners = new Map();
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  else if (msg.method && listeners.has(msg.method)) listeners.get(msg.method)(msg.params);
});
const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++seq;
  pending.set(id, resolve);
  ws.send(JSON.stringify({ id, method, params }));
});
const once = (method) => new Promise((r) => listeners.set(method, (p) => { listeners.delete(method); r(p); }));

let W = 1600, H = 900;
await send('Page.enable');
await send('Runtime.enable');
listeners.set('Runtime.consoleAPICalled', () => {});
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

for (const s of steps) {
  if (s.size) {
    [W, H] = s.size;
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: s.dpr || 1, mobile: !!s.mobile });
  }
  if (s.nav) {
    const loaded = once('Page.loadEventFired');
    await send('Page.navigate', { url: s.nav });
    await Promise.race([loaded, sleep(20000)]);
  }
  if (s.wait) await sleep(s.wait);
  if (s.eval) {
    const r = await send('Runtime.evaluate', { expression: s.eval, awaitPromise: true, returnByValue: true, timeout: 600000 });
    const v = r.result?.result?.value;
    const ex = r.result?.exceptionDetails;
    console.log('eval →', ex ? ('EXCEPTION ' + (ex.exception?.description || ex.text)) : JSON.stringify(v)?.slice(0, 600));
    if (s.out && !ex) fs.writeFileSync(path.join(OUT, s.out), JSON.stringify(v, null, 1));
  }
  if (s.move) {
    const [x, y] = s.move;
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  }
  if (s.click) {
    const [x, y] = s.click;
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    for (const type of ['mousePressed', 'mouseReleased']) {
      await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    }
  }
  if (s.key) {
    for (const ch of s.key) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
    }
  }
  if (s.shot) {
    if (s.full) {
      // Page entière : la fenêtre prend la hauteur du document le temps de la capture.
      const h = await send('Runtime.evaluate', { expression: 'Math.ceil(document.documentElement.scrollHeight)', returnByValue: true });
      await send('Emulation.setDeviceMetricsOverride', { width: W, height: h.result.result.value, deviceScaleFactor: 1, mobile: false });
      await sleep(400);
    }
    const r = await Promise.race([send('Page.captureScreenshot', { format: s.jpeg ? 'jpeg' : 'png', ...(s.jpeg ? { quality: 88 } : {}), captureBeyondViewport: false, optimizeForSpeed: !!s.fast }), sleep(s.timeout || 60000).then(() => null)]);
    if (!r) { console.log('shot TIMEOUT', s.shot); continue; }
    const file = path.join(OUT, s.shot + (s.jpeg ? '.jpg' : '.png'));
    fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    console.log('shot →', file);
  }
}

try { await send('Browser.close'); } catch { /* déjà fermé */ }
ws.close();
setTimeout(() => { try { chrome.kill(); } catch { /* */ } process.exit(0); }, 500);
