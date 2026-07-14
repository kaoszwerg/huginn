import { describe, it, expect, beforeAll } from "vitest";

/**
 * The overlay script (`main.ts`) has no IPC capability: the backend drives it entirely through the
 * global functions it installs (`__huginnState`, `__huginnLevel`) and the URL fragment. These tests
 * pin that contract — the state vocabulary the backend pushes (`push_state` in win32/session.rs) must
 * keep matching the words rendered here.
 */

type OverlayWindow = Window & {
  __huginnState?: (state: string) => void;
  __huginnLevel?: (level: number) => void;
};

function setupDom() {
  document.body.innerHTML = `
    <div class="overlay">
      <span class="pulse"></span>
      <span class="meter" data-overlay-meter><span class="bar"></span></span>
      <span role="status" data-overlay-state>fallback</span>
      <span class="hint" data-overlay-hint>fallback</span>
    </div>`;
}

const stateText = () => document.querySelector("[data-overlay-state]")?.textContent;
const meterDisplay = () =>
  document.querySelector<HTMLElement>("[data-overlay-meter]")?.style.display;
const setState = (s: string) => (window as OverlayWindow).__huginnState?.(s);

describe("recording overlay", () => {
  beforeAll(async () => {
    window.location.hash = "#de";
    setupDom();
    // Importing runs the script's one-time render() — it wires the globals and paints "listening".
    await import("./main");
  });

  it("starts in the listening state with the meter visible", () => {
    expect(stateText()).toBe("Ich höre zu …");
    expect(meterDisplay()).not.toBe("none");
  });

  it("switches to 'working' and hides the live meter while the app transcribes", () => {
    setState("working");
    expect(stateText()).toBe("Verarbeite …");
    expect(meterDisplay()).toBe("none");
  });

  it("shows the inserted and the not-recognised outcomes", () => {
    setState("done");
    expect(stateText()).toBe("Eingefügt");
    setState("error");
    expect(stateText()).toBe("Nicht erkannt");
  });

  it("ignores an unknown state name rather than blanking the overlay", () => {
    setState("done");
    setState("this-is-not-a-state");
    expect(stateText()).toBe("Eingefügt");
  });

  it("takes a level push without throwing", () => {
    expect(() => (window as OverlayWindow).__huginnLevel?.(0.5)).not.toThrow();
  });
});
