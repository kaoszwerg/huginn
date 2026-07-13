import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("renders its children and forwards clicks", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Clear</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("defaults to type=button so it never submits a form by accident", () => {
    render(<Button>Go</Button>);
    expect(screen.getByRole("button", { name: "Go" })).toHaveAttribute("type", "button");
  });

  it("carries the destructive tone when the action is destructive", () => {
    render(
      <Button tone="danger" variant="solid">
        Delete
      </Button>,
    );
    // The token, not a hex: the same class has to work in both themes (rule:design-system).
    expect(screen.getByRole("button", { name: "Delete" }).className).toContain("bg-danger");
  });

  it("never paints a raw colour — every surface goes through a design token", () => {
    render(<Button tone="accent">Record</Button>);
    const btn = screen.getByRole("button", { name: "Record" });
    expect(btn.className).not.toMatch(/#[0-9a-f]{3,6}/i);
    expect(btn.getAttribute("style")).toBeNull();
  });

  it("shows its own tooltip on keyboard focus instead of a native title", () => {
    // The native `title` is an OS-drawn bubble and never appears on focus — a keyboard user would
    // never see it at all (ADR-APP-026).
    render(<Button tooltip="Toggle sort order">Newest</Button>);
    const btn = screen.getByRole("button", { name: "Newest" });
    expect(btn).not.toHaveAttribute("title");
    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.focus(btn);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Toggle sort order");
  });

  it("passes through arbitrary attributes like aria-pressed", () => {
    render(<Button aria-pressed>Live</Button>);
    expect(screen.getByRole("button", { name: "Live" })).toHaveAttribute("aria-pressed", "true");
  });
});
