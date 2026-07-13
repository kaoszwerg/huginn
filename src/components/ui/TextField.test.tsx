import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TextField } from "./TextField";

describe("TextField", () => {
  it("renders a text input with the given accessible name", () => {
    render(<TextField aria-label="Search logs" placeholder="search…" />);
    const input = screen.getByRole("textbox", { name: "Search logs" });
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveAttribute("placeholder", "search…");
  });

  it("is controllable and reports changes", () => {
    const onChange = vi.fn();
    render(<TextField aria-label="Search logs" value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Search logs" }), {
      target: { value: "error" },
    });
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("drops the native outline — the focus ring is one global token, not a per-field invention", () => {
    render(<TextField aria-label="Search logs" />);
    const input = screen.getByRole("textbox", { name: "Search logs" });
    // The visible ring comes from the global :focus-visible rule in globals.css (one ring, one
    // token, every control). A field that drew its own would drift from the others.
    expect(input.className).toContain("outline-none");
    expect(input.className).not.toMatch(/#[0-9a-f]{3,6}/i);
  });
});
