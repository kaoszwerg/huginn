import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SettingsView } from "./SettingsView";

const mutate = vi.fn();

vi.mock("../hooks/useSettings", () => ({
  useSettings: vi.fn(),
  useUpdateSettings: vi.fn(),
}));

import { useSettings, useUpdateSettings } from "../hooks/useSettings";

function mockSettings(overrides: { ui_scale?: number; minimize_to_tray?: boolean } = {}) {
  vi.mocked(useSettings).mockReturnValue({
    data: { ui_scale: 1, minimize_to_tray: false, ...overrides },
  } as unknown as ReturnType<typeof useSettings>);
  vi.mocked(useUpdateSettings).mockReturnValue({
    mutate,
  } as unknown as ReturnType<typeof useUpdateSettings>);
}

describe("SettingsView", () => {
  beforeEach(() => {
    mutate.mockReset();
  });

  it("calls updateSettings with the chosen UI scale", () => {
    mockSettings();
    render(<SettingsView />);

    fireEvent.click(screen.getByRole("button", { name: "125%" }));
    expect(mutate).toHaveBeenCalledWith({ uiScale: 1.25 });
  });

  it("renders a scale button for the persisted value", () => {
    mockSettings({ ui_scale: 0.8 });
    render(<SettingsView />);
    expect(screen.getByRole("button", { name: "80%" })).toBeInTheDocument();
  });

  it("marks Quit app as pressed when minimizeToTray is false", () => {
    mockSettings({ minimize_to_tray: false });
    render(<SettingsView />);
    expect(screen.getByRole("button", { name: "Quit app" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Minimize to tray" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("marks Minimize to tray as pressed when minimizeToTray is true", () => {
    mockSettings({ minimize_to_tray: true });
    render(<SettingsView />);
    expect(screen.getByRole("button", { name: "Minimize to tray" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Quit app" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("toggles minimizeToTray via the close-button preference", () => {
    mockSettings();
    render(<SettingsView />);

    fireEvent.click(screen.getByRole("button", { name: "Minimize to tray" }));
    expect(mutate).toHaveBeenCalledWith({ minimizeToTray: true });

    fireEvent.click(screen.getByRole("button", { name: "Quit app" }));
    expect(mutate).toHaveBeenCalledWith({ minimizeToTray: false });
  });

  it("falls back to defaults (100%, Quit app) while settings have not loaded", () => {
    vi.mocked(useSettings).mockReturnValue({
      data: undefined,
    } as unknown as ReturnType<typeof useSettings>);
    vi.mocked(useUpdateSettings).mockReturnValue({
      mutate,
    } as unknown as ReturnType<typeof useUpdateSettings>);
    render(<SettingsView />);

    expect(screen.getByRole("button", { name: "100%" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quit app" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
