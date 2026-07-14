import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FileDropZone } from "./FileDropZone";

// The Tauri drag-drop event is the platform mechanism the zone is built on. We capture the callback
// the component registers and drive it with the payloads Tauri would send.
const h = vi.hoisted(() => ({
  handler: undefined as undefined | ((e: { payload: unknown }) => void),
  unlisten: vi.fn(),
}));

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: (cb: (e: { payload: unknown }) => void) => {
      h.handler = cb;
      return Promise.resolve(h.unlisten);
    },
  }),
}));

/** Fire a drag-drop payload at the zone (inside `act`, since it updates state). */
function fire(payload: unknown) {
  act(() => h.handler?.({ payload }));
}

// jsdom's getBoundingClientRect is all-zeros, so (0,0) is inside the zone and anything else is not.
const ON = { x: 0, y: 0 };
const OFF = { x: 9999, y: 9999 };

describe("FileDropZone", () => {
  beforeEach(() => {
    h.handler = undefined;
    h.unlisten.mockReset();
  });

  it("reports the dropped paths, filtered by the accepted extensions", () => {
    const onDrop = vi.fn();
    render(
      <FileDropZone onDrop={onDrop} extensions={["bin"]}>
        drop here
      </FileDropZone>,
    );
    fire({ type: "drop", position: ON, paths: ["/a/model.BIN", "/a/notes.txt"] });
    // Case-insensitive match, and the non-.bin file is dropped from the result.
    expect(onDrop).toHaveBeenCalledWith(["/a/model.BIN"]);
  });

  it("ignores a drop that lands outside the zone", () => {
    const onDrop = vi.fn();
    render(<FileDropZone onDrop={onDrop}>drop here</FileDropZone>);
    fire({ type: "drop", position: OFF, paths: ["/a/model.bin"] });
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("ignores a drop with no file of an accepted extension", () => {
    const onDrop = vi.fn();
    render(
      <FileDropZone onDrop={onDrop} extensions={["bin"]}>
        drop here
      </FileDropZone>,
    );
    fire({ type: "drop", position: ON, paths: ["/a/notes.txt"] });
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("does nothing while disabled", () => {
    const onDrop = vi.fn();
    render(
      <FileDropZone onDrop={onDrop} disabled>
        drop here
      </FileDropZone>,
    );
    fire({ type: "drop", position: ON, paths: ["/a/model.bin"] });
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("marks itself as a drop target only while a drag is over it", () => {
    render(<FileDropZone onDrop={vi.fn()}>drop here</FileDropZone>);
    // The text sits directly in the zone div, so getByText returns the zone itself.
    const zone = screen.getByText("drop here");

    fire({ type: "over", position: ON, paths: [] });
    expect(zone.hasAttribute("data-drag-over")).toBe(true);

    fire({ type: "leave", position: ON, paths: [] });
    expect(zone.hasAttribute("data-drag-over")).toBe(false);
  });
});
