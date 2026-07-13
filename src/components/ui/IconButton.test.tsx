import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { IconButton } from "./IconButton";

describe("IconButton", () => {
  it("exposes the label as its accessible name", () => {
    render(
      <IconButton label="Minimize">
        <svg />
      </IconButton>,
    );
    expect(screen.getByRole("button", { name: "Minimize" })).toBeInTheDocument();
  });

  it("forwards clicks and pass-through attributes", () => {
    const onClick = vi.fn();
    render(
      <IconButton label="Home" aria-current="page" onClick={onClick}>
        <svg />
      </IconButton>,
    );
    const btn = screen.getByRole("button", { name: "Home" });
    expect(btn).toHaveAttribute("aria-current", "page");
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("surfaces the label as a HUD tooltip on focus by default", () => {
    render(
      <IconButton label="Scroll to top">
        <svg />
      </IconButton>,
    );
    const btn = screen.getByRole("button", { name: "Scroll to top" });
    expect(btn).not.toHaveAttribute("title");

    fireEvent.focus(btn);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Scroll to top");
  });

  it("renders no tooltip when tooltip is null (aria-label still applies)", () => {
    render(
      <IconButton label="Close" tooltip={null}>
        <svg />
      </IconButton>,
    );
    const btn = screen.getByRole("button", { name: "Close" });
    fireEvent.focus(btn);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
