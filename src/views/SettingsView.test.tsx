import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SettingsView } from "./SettingsView";
import type { SettingsDto } from "../bindings/SettingsDto";
import type { HotkeyStatus } from "../bindings/HotkeyStatus";

const mutate = vi.fn();
const setHotkeyMutate = vi.fn();

vi.mock("../hooks/useSettings", () => ({
  useSettings: vi.fn(),
  useUpdateSettings: vi.fn(),
}));
vi.mock("../hooks/useHotkey", () => ({
  useHotkeyStatus: vi.fn(),
  useSetHotkey: vi.fn(),
}));

import { useSettings, useUpdateSettings } from "../hooks/useSettings";
import { useHotkeyStatus, useSetHotkey } from "../hooks/useHotkey";

const DEFAULTS: SettingsDto = {
  ui_scale: 1,
  minimize_to_tray: false,
  theme: "system",
  hotkey: "Ctrl+Space",
};

const ARMED: HotkeyStatus = { shortcut: "Ctrl+Space", registered: true, error: null };

function mockSettings(
  settings: Partial<SettingsDto> = {},
  hotkey: HotkeyStatus | undefined = ARMED,
) {
  vi.mocked(useSettings).mockReturnValue({
    data: { ...DEFAULTS, ...settings },
  } as unknown as ReturnType<typeof useSettings>);
  vi.mocked(useUpdateSettings).mockReturnValue({
    mutate,
  } as unknown as ReturnType<typeof useUpdateSettings>);
  vi.mocked(useHotkeyStatus).mockReturnValue({
    data: hotkey,
  } as unknown as ReturnType<typeof useHotkeyStatus>);
  vi.mocked(useSetHotkey).mockReturnValue({
    mutate: setHotkeyMutate,
    isPending: false,
    isSuccess: false,
  } as unknown as ReturnType<typeof useSetHotkey>);
}

describe("SettingsView", () => {
  beforeEach(() => {
    mutate.mockReset();
    setHotkeyMutate.mockReset();
  });

  it("shows the hotkey that is actually registered", () => {
    mockSettings({}, { shortcut: "Ctrl+Shift+KeyJ", registered: true, error: null });
    render(<SettingsView />);
    expect(screen.getByText("Ctrl + Shift + J")).toBeInTheDocument();
  });

  it("records a new hotkey and sends it to the backend", () => {
    mockSettings();
    render(<SettingsView />);

    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    fireEvent.keyDown(window, { code: "F9" });
    expect(setHotkeyMutate).toHaveBeenCalledWith("F9");
  });

  it("tells the user when push-to-talk is dead, and why", () => {
    // The failure that makes the product do nothing at all must be visible in the window — not
    // buried in a log file nobody opens (rule:overlay-and-input).
    mockSettings(
      {},
      {
        shortcut: "Ctrl+Space",
        registered: false,
        error: "“Ctrl+Space” is already used by another application. Pick a different combination.",
      },
    );
    render(<SettingsView />);

    const notice = screen.getAllByRole("status").find((n) => n.textContent?.includes("not active"));
    expect(notice).toBeDefined();
    expect(notice).toHaveTextContent("already used by another application");
  });

  it("says nothing about the hotkey when it is armed", () => {
    mockSettings();
    render(<SettingsView />);
    expect(screen.queryByText(/not active/)).toBeNull();
  });

  it("switches the theme", () => {
    mockSettings();
    render(<SettingsView />);

    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(mutate).toHaveBeenCalledWith({ theme: "dark" });
  });

  it("marks the persisted theme as pressed", () => {
    mockSettings({ theme: "light" });
    render(<SettingsView />);
    expect(screen.getByRole("button", { name: "Light" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Follow system" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("calls updateSettings with the chosen UI scale", () => {
    mockSettings();
    render(<SettingsView />);

    fireEvent.click(screen.getByRole("button", { name: "125%" }));
    expect(mutate).toHaveBeenCalledWith({ uiScale: 1.25 });
  });

  it("toggles the close-button behaviour", () => {
    mockSettings();
    render(<SettingsView />);

    fireEvent.click(screen.getByRole("button", { name: "Keep running in the tray" }));
    expect(mutate).toHaveBeenCalledWith({ minimizeToTray: true });

    fireEvent.click(screen.getByRole("button", { name: "Quit Huginn" }));
    expect(mutate).toHaveBeenCalledWith({ minimizeToTray: false });
  });

  it("falls back to the defaults while settings have not loaded", () => {
    vi.mocked(useSettings).mockReturnValue({
      data: undefined,
    } as unknown as ReturnType<typeof useSettings>);
    vi.mocked(useUpdateSettings).mockReturnValue({
      mutate,
    } as unknown as ReturnType<typeof useUpdateSettings>);
    vi.mocked(useHotkeyStatus).mockReturnValue({
      data: undefined,
    } as unknown as ReturnType<typeof useHotkeyStatus>);
    vi.mocked(useSetHotkey).mockReturnValue({
      mutate: setHotkeyMutate,
      isPending: false,
      isSuccess: false,
    } as unknown as ReturnType<typeof useSetHotkey>);
    render(<SettingsView />);

    expect(screen.getByRole("button", { name: "100%" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quit Huginn" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("Ctrl + Space")).toBeInTheDocument();
  });
});
