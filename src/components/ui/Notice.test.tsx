import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Notice } from "./Notice";
import { Button } from "./Button";

describe("Notice", () => {
  it("announces itself to a screen reader without hijacking it", () => {
    // `status`, not `alert`: a dead hotkey is a standing condition, not an interruption.
    render(<Notice tone="danger">Push-to-talk is not active.</Notice>);
    expect(screen.getByRole("status")).toHaveTextContent("Push-to-talk is not active.");
  });

  it("carries the way out, not just the complaint", () => {
    render(
      <Notice tone="danger" action={<Button>Fix it</Button>}>
        That combination is already taken.
      </Notice>,
    );
    expect(screen.getByRole("button", { name: "Fix it" })).toBeInTheDocument();
  });

  it("takes its colour from a theme token, never a hex", () => {
    const { container } = render(<Notice tone="warning">Careful.</Notice>);
    expect(container.innerHTML).toContain("var(--huginn-warning)");
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{6}/i);
  });
});
