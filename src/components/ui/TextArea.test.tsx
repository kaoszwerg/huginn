import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TextArea } from "./TextArea";

describe("TextArea", () => {
  it("renders a multi-line input with the given accessible name", () => {
    render(<TextArea aria-label="Macro text" placeholder="…" rows={4} />);
    const box = screen.getByRole("textbox", { name: "Macro text" });
    expect(box.tagName).toBe("TEXTAREA");
    expect(box).toHaveAttribute("rows", "4");
  });

  it("is controllable and reports changes", () => {
    const onChange = vi.fn();
    render(<TextArea aria-label="Macro text" value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Macro text" }), {
      target: { value: "Mit freundlichen Grüßen" },
    });
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("drops the native outline — the focus ring is one global token, not a per-field invention", () => {
    render(<TextArea aria-label="Macro text" />);
    const box = screen.getByRole("textbox", { name: "Macro text" });
    expect(box.className).toContain("outline-none");
    expect(box.className).not.toMatch(/#[0-9a-f]{3,6}/i);
  });
});
