import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("renders its children and forwards clicks", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>clear</Button>);
    const btn = screen.getByRole("button", { name: "clear" });
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("defaults to type=button so it never submits a form by accident", () => {
    render(<Button>go</Button>);
    expect(screen.getByRole("button", { name: "go" })).toHaveAttribute("type", "button");
  });

  it("draws the chamfered HUD surface with the requested accent", () => {
    render(
      <Button accent="danger" active>
        stop
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "stop" });
    expect(btn.className).toContain("hud-btn");
    expect(btn.className).toContain("hud-accent-danger");
    expect(btn.className).toContain("hud-btn-active");
  });

  it("ghost variant is borderless (no chamfered hud-btn surface)", () => {
    render(<Button variant="ghost">link</Button>);
    expect(screen.getByRole("button", { name: "link" }).className).not.toContain("hud-btn");
  });

  it("shows a HUD tooltip on focus instead of a native title", () => {
    render(<Button tooltip="Toggle sort order">newest</Button>);
    const btn = screen.getByRole("button", { name: "newest" });
    expect(btn).not.toHaveAttribute("title");
    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.focus(btn);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Toggle sort order");
  });

  it("passes through arbitrary attributes like aria-pressed", () => {
    render(<Button aria-pressed>live</Button>);
    expect(screen.getByRole("button", { name: "live" })).toHaveAttribute("aria-pressed", "true");
  });
});
