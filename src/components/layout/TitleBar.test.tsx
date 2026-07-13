import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TitleBar } from "./TitleBar";
import { APP_NAME } from "../../lib/app";
import type { BuildInfo } from "../../bindings/BuildInfo";

// TitleBar imports this SVG for the app icon; the build pipeline normally provides it, jsdom needs a stub.
vi.mock("../../../src-tauri/icons/icon.svg", () => ({ default: "icon.svg" }));

vi.mock("../../api/commands", () => ({
  api: {
    buildInfo: vi.fn(),
  },
}));

const minimize = vi.fn();
const toggleMaximize = vi.fn();
const close = vi.fn();
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ minimize, toggleMaximize, close, label: "main" }),
}));

import { api } from "../../api/commands";

function renderTitleBar(build: BuildInfo) {
  vi.mocked(api.buildInfo).mockResolvedValue(build);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TitleBar />
    </QueryClientProvider>,
  );
}

const devBuild: BuildInfo = {
  version: "0.1.0",
  channel: "dev",
  debug: true,
  git_sha: "abc1234",
  git_dirty: false,
  commit_date: "2026-07-11T00:00:00Z",
};

describe("TitleBar", () => {
  beforeEach(() => {
    minimize.mockReset();
    toggleMaximize.mockReset();
    close.mockReset();
    vi.mocked(api.buildInfo).mockReset();
  });

  it("shows the app name and a dev badge for a dev build", async () => {
    renderTitleBar(devBuild);
    expect(await screen.findByText("Dev")).toBeInTheDocument();
    expect(screen.getAllByText(APP_NAME, { exact: false }).length).toBeGreaterThan(0);
  });

  it("hides the dev badge for a release build", async () => {
    renderTitleBar({ ...devBuild, channel: "release" });
    await waitFor(() => expect(api.buildInfo).toHaveBeenCalled());
    expect(screen.queryByText("Dev")).toBeNull();
  });

  it("wires the window controls to the Tauri window API", () => {
    renderTitleBar(devBuild);

    fireEvent.click(screen.getByRole("button", { name: "Minimize" }));
    expect(minimize).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Maximize" }));
    expect(toggleMaximize).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(close).toHaveBeenCalledTimes(1);
  });
});
