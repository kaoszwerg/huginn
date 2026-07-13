import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { HotkeyField } from "./HotkeyField";
import { toShortcutSpec, humaniseShortcut } from "./shortcut";

/**
 * `toShortcutSpec` produces the string the **Rust** side parses with `global-hotkey`. It is a
 * contract across the IPC boundary, so it is pinned here as well as in Rust (rule:testing): a
 * reworded key name on either side would silently leave the user with a hotkey that never fires.
 */
describe("toShortcutSpec", () => {
  const event = (over: Partial<Parameters<typeof toShortcutSpec>[0]>) => ({
    code: "Space",
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ...over,
  });

  it("produces the default combination exactly as the backend spells it", () => {
    expect(toShortcutSpec(event({ code: "Space", ctrlKey: true }))).toBe("Ctrl+Space");
  });

  it("orders modifiers the same way every time", () => {
    expect(
      toShortcutSpec(event({ code: "KeyJ", ctrlKey: true, shiftKey: true, altKey: true })),
    ).toBe("Ctrl+Shift+Alt+KeyJ");
  });

  it("uses the physical key code, not the character the layout produces", () => {
    // On a German keyboard the key labelled Y sits where KeyZ is. Recording the *character* would
    // move the shortcut with the layout; recording the code keeps it under the same finger.
    expect(toShortcutSpec(event({ code: "KeyZ", ctrlKey: true }))).toBe("Ctrl+KeyZ");
  });

  it("returns nothing while only modifiers are held — that is not a combination yet", () => {
    expect(toShortcutSpec(event({ code: "ControlLeft", ctrlKey: true }))).toBeNull();
    expect(toShortcutSpec(event({ code: "ShiftRight", shiftKey: true }))).toBeNull();
    expect(toShortcutSpec(event({ code: "AltLeft", altKey: true }))).toBeNull();
  });

  it("records a single key with no modifier at all (F9 is a legal push-to-talk key)", () => {
    expect(toShortcutSpec(event({ code: "F9" }))).toBe("F9");
  });
});

describe("humaniseShortcut", () => {
  it("shows the user a combination, not an enum", () => {
    expect(humaniseShortcut("Ctrl+Shift+KeyJ")).toBe("Ctrl + Shift + J");
    expect(humaniseShortcut("Ctrl+Space")).toBe("Ctrl + Space");
    expect(humaniseShortcut("Alt+Digit1")).toBe("Alt + 1");
  });
});

describe("HotkeyField", () => {
  it("shows the current combination", () => {
    render(<HotkeyField value="Ctrl+Space" onChange={vi.fn()} />);
    expect(screen.getByText("Ctrl + Space")).toBeInTheDocument();
  });

  it("records the next combination the user presses", () => {
    const onChange = vi.fn();
    render(<HotkeyField value="Ctrl+Space" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.getByRole("status")).toHaveTextContent("Press a combination");

    fireEvent.keyDown(window, { code: "KeyJ", ctrlKey: true, shiftKey: true });
    expect(onChange).toHaveBeenCalledWith("Ctrl+Shift+KeyJ");
  });

  it("keeps waiting while the user is still reaching for the key", () => {
    const onChange = vi.fn();
    render(<HotkeyField value="Ctrl+Space" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Change" }));

    fireEvent.keyDown(window, { code: "ControlLeft", ctrlKey: true });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("cancels on Escape without changing anything", () => {
    const onChange = vi.fn();
    render(<HotkeyField value="Ctrl+Space" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Change" }));

    fireEvent.keyDown(window, { code: "Escape" });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText("Ctrl + Space")).toBeInTheDocument();
  });

  it("cannot start recording while a change is still in flight", () => {
    render(<HotkeyField value="Ctrl+Space" onChange={vi.fn()} busy />);
    expect(screen.getByRole("button", { name: "Change" })).toBeDisabled();
  });
});
