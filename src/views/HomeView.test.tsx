import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { HomeView } from "./HomeView";
import { APP_DESCRIPTION, APP_NAME } from "../lib/app";
import type { BuildInfo } from "../bindings/BuildInfo";

vi.mock("../api/commands", () => ({
  api: {
    buildInfo: vi.fn(),
  },
}));

import { api } from "../api/commands";

function renderHome() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <HomeView />
    </QueryClientProvider>,
  );
}

describe("HomeView", () => {
  beforeEach(() => {
    vi.mocked(api.buildInfo).mockReset();
  });

  it("shows the app name and description", () => {
    vi.mocked(api.buildInfo).mockResolvedValue({
      version: "0.1.0",
      channel: "dev",
      debug: true,
      git_sha: "abc1234",
      git_dirty: false,
      commit_date: "2026-07-11T00:00:00Z",
    });
    renderHome();
    expect(screen.getByText(APP_NAME)).toBeInTheDocument();
    expect(screen.getByText(APP_DESCRIPTION)).toBeInTheDocument();
  });

  it("renders the build identity once it loads, including a dirty marker", async () => {
    const build: BuildInfo = {
      version: "0.2.0",
      channel: "release",
      debug: false,
      git_sha: "deadbee",
      git_dirty: true,
      commit_date: "2026-07-10T00:00:00Z",
    };
    vi.mocked(api.buildInfo).mockResolvedValue(build);
    renderHome();

    expect(await screen.findByText("v0.2.0")).toBeInTheDocument();
    expect(screen.getByText("release")).toBeInTheDocument();
    expect(screen.getByText("deadbee+")).toBeInTheDocument();
    expect(screen.getByText("false")).toBeInTheDocument();
  });

  it("shows placeholders before the build info has loaded", async () => {
    vi.mocked(api.buildInfo).mockReturnValue(new Promise(() => {}));
    renderHome();
    await waitFor(() => expect(screen.getAllByText("—").length).toBe(4));
  });
});
