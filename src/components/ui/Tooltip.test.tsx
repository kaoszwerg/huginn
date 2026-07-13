import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Tooltip } from "./Tooltip";

// The pointer path uses React's synthesised mouseenter/leave, which jsdom cannot reliably dispatch,
// so these tests drive the keyboard-focus path — the accessibility-critical one. Both paths share the
// same open/close state, so covering focus proves the behaviour.
describe("Tooltip", () => {
  it("is hidden until the trigger is focused", () => {
    render(
      <Tooltip content="Toggle sort order">
        <button>sort</button>
      </Tooltip>,
    );
    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.focus(screen.getByRole("button", { name: "sort" }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Toggle sort order");
  });

  it("links the tooltip to the trigger via aria-describedby while open", () => {
    render(
      <Tooltip content="hint">
        <button>t</button>
      </Tooltip>,
    );
    const btn = screen.getByRole("button", { name: "t" });
    fireEvent.focus(btn);
    const tip = screen.getByRole("tooltip");
    expect(btn).toHaveAttribute("aria-describedby", tip.id);
  });

  it("hides on blur", () => {
    render(
      <Tooltip content="hint">
        <button>t</button>
      </Tooltip>,
    );
    const btn = screen.getByRole("button", { name: "t" });
    fireEvent.focus(btn);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.blur(btn);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("hides on Escape", () => {
    render(
      <Tooltip content="hint">
        <button>t</button>
      </Tooltip>,
    );
    fireEvent.focus(screen.getByRole("button", { name: "t" }));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("preserves a handler the trigger already had", () => {
    const onFocus = vi.fn();
    render(
      <Tooltip content="hint">
        <button onFocus={onFocus}>t</button>
      </Tooltip>,
    );
    fireEvent.focus(screen.getByRole("button", { name: "t" }));
    expect(onFocus).toHaveBeenCalledOnce();
  });
});
