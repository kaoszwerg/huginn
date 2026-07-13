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

  it("drops the native focus outline in favour of the HUD focus ring", () => {
    render(<TextField aria-label="Search logs" />);
    const input = screen.getByRole("textbox", { name: "Search logs" });
    expect(input.className).toContain("outline-none");
    expect(input.className).toContain("focus:ring-1");
  });
});
