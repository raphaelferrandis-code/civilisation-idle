import { describe, it, expect, vi } from "vitest";
import { createClickLock, CLICK_LOCK_MS } from "../clickLock.js";

// BUG-46 (audit du 2026-10-05) : le verrou anti double-clic des tables. Le 2e clic
// d'un double-clic tombe sur le bouton de la phase suivante (« Même mise » sous
// « Tirer ») ; un verrou horodaté commun le laisse tomber dans le vide.

function clock(t0 = 1000) {
  let t = t0;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

describe("verrou anti double-clic des tables", () => {
  it("une action passe, la suivante attend la fin du verrou", () => {
    const c = clock();
    const lock = createClickLock(CLICK_LOCK_MS, c.now);
    const fn = vi.fn(() => "donné");
    expect(lock.act(fn)).toBe("donné");
    c.advance(120);                       // le 2e clic d'un double-clic
    expect(lock.act(fn)).toBeUndefined();
    c.advance(CLICK_LOCK_MS - 121);
    expect(lock.act(fn)).toBeUndefined();
    c.advance(1);                         // le verrou part du PREMIER clic, pas du refusé
    expect(lock.act(fn)).toBe("donné");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("un verrou commun : une autre action est refusée aussi", () => {
    const c = clock();
    const lock = createClickLock(CLICK_LOCK_MS, c.now);
    const tirer = vi.fn(), memeMise = vi.fn();
    lock.act(tirer);
    c.advance(80);
    lock.act(memeMise);                   // le menu de fin, apparu sous le curseur
    expect(tirer).toHaveBeenCalledTimes(1);
    expect(memeMise).not.toHaveBeenCalled();
  });

  it("arm() verrouille un menu qui vient d'apparaître, sans agir", () => {
    const c = clock();
    const lock = createClickLock(CLICK_LOCK_MS, c.now);
    const fn = vi.fn();
    lock.arm();
    c.advance(200);
    lock.act(fn);
    expect(fn).not.toHaveBeenCalled();
    c.advance(CLICK_LOCK_MS);
    lock.act(fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
