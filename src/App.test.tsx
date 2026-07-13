import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";
import App from "./App";
import { APP_NAME } from "./lib/app";

vi.mock("./api/commands", () => ({
  api: {
    appVersion: vi.fn().mockResolvedValue("0.1.0"),
    buildInfo: vi.fn().mockResolvedValue({
      version: "0.1.0",
      channel: "dev",
      debug: true,
      git_sha: "abc1234",
      git_dirty: false,
      commit_date: "2026-07-11T00:00:00Z",
    }),
    getSettings: vi.fn().mockResolvedValue({
      ui_scale: 1,
      minimize_to_tray: false,
      theme: "system",
      hotkey: "Ctrl+Space",
    }),
    updateSettings: vi.fn(),
    getHotkeyStatus: vi
      .fn()
      .mockResolvedValue({ shortcut: "Ctrl+Space", registered: true, error: null }),
    setHotkey: vi.fn(),
    getAutostart: vi.fn().mockResolvedValue(false),
    setAutostart: vi.fn(),
    getRecentLogs: vi.fn().mockResolvedValue([]),
    openExternal: vi.fn(),
  },
}));

// The TitleBar imports an SVG that the build pipeline normally provides; in jsdom we stub it.
vi.mock("../src-tauri/icons/icon.svg", () => ({ default: "icon.svg" }));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
    label: "main",
  }),
}));

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({ setZoom: vi.fn().mockResolvedValue(undefined) }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => undefined),
}));

function renderApp() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <App />
    </QueryClientProvider>,
  );
}

describe("App shell", () => {
  it("renders the title bar with the app name", async () => {
    renderApp();
    expect(await screen.findAllByText(APP_NAME, { exact: false })).toBeTruthy();
  });

  it("shows the primary navigation rail", () => {
    renderApp();
    expect(screen.getByLabelText("Primary")).toBeInTheDocument();
    expect(screen.getByLabelText("Home")).toBeInTheDocument();
    expect(screen.getByLabelText("Logs")).toBeInTheDocument();
    expect(screen.getByLabelText("Settings")).toBeInTheDocument();
  });

  it("says nothing when push-to-talk is armed", async () => {
    renderApp();
    await screen.findAllByText(APP_NAME, { exact: false });
    expect(screen.queryByText(/not active/)).toBeNull();
  });

  it("tells the user in the window when push-to-talk is dead", async () => {
    // This is the failure that makes the whole product silently useless. It has to be impossible to
    // miss — a log line is not a message to a user (rule:overlay-and-input).
    const { api } = await import("./api/commands");
    vi.mocked(api.getHotkeyStatus).mockResolvedValueOnce({
      shortcut: "Ctrl+Space",
      registered: false,
      error: "“Ctrl+Space” is already used by another application. Pick a different combination.",
    });

    renderApp();

    expect(await screen.findByText(/Push-to-talk is not active/)).toBeInTheDocument();
    expect(screen.getByText(/already used by another application/)).toBeInTheDocument();
    // …and it offers the way out, not just the bad news.
    expect(screen.getByRole("button", { name: "Fix it" })).toBeInTheDocument();
  });
});
