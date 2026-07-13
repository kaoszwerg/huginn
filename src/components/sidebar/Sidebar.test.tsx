import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { Sidebar } from "./Sidebar";
import { useUiStore } from "../../store/ui";

describe("Sidebar", () => {
  beforeEach(() => {
    useUiStore.setState({ view: "home", aboutOpen: false });
  });

  it("exposes the primary navigation landmark with Home, Logs and Settings", () => {
    render(<Sidebar />);
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Logs" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
  });

  it("marks the active view as the current page", () => {
    render(<Sidebar />);
    expect(screen.getByRole("button", { name: "Home" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Logs" })).not.toHaveAttribute("aria-current");
  });

  it("switches the active view when a nav button is clicked", () => {
    render(<Sidebar />);

    fireEvent.click(screen.getByRole("button", { name: "Logs" }));
    expect(useUiStore.getState().view).toBe("logs");
    expect(screen.getByRole("button", { name: "Logs" })).toHaveAttribute("aria-current", "page");

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(useUiStore.getState().view).toBe("settings");
    expect(screen.getByRole("button", { name: "Settings" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
