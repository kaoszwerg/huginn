import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { StatusBar } from "./StatusBar";
import { APP_NAME } from "../../lib/app";
import { useUiStore } from "../../store/ui";
import type { BuildInfo } from "../../bindings/BuildInfo";

vi.mock("../../api/commands", () => ({
  api: {
    buildInfo: vi.fn(),
  },
}));

import { api } from "../../api/commands";

const build: BuildInfo = {
  version: "0.1.0",
  channel: "dev",
  debug: true,
  git_sha: "abc1234",
  git_dirty: false,
  commit_date: "2026-07-11T00:00:00Z",
};

function renderStatusBar(props: Parameters<typeof StatusBar>[0] = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <StatusBar {...props} />
    </QueryClientProvider>,
  );
}

describe("StatusBar", () => {
  beforeEach(() => {
    useUiStore.setState({ view: "home", aboutOpen: false });
    vi.mocked(api.buildInfo).mockReset();
    vi.mocked(api.buildInfo).mockResolvedValue(build);
  });

  it("opens the About dialog when the build identity is clicked", async () => {
    renderStatusBar();
    const aboutButton = await screen.findByRole("button", {
      name: (name) => name.toLowerCase().includes(APP_NAME.toLowerCase()),
    });

    fireEvent.click(aboutButton);
    expect(useUiStore.getState().aboutOpen).toBe(true);
  });

  it("shows the build version and commit once loaded", async () => {
    renderStatusBar();
    await waitFor(() => expect(api.buildInfo).toHaveBeenCalled());
    expect(await screen.findByText(/v0\.1\.0/)).toBeInTheDocument();
  });

  it("shows the scroll-to-top control only when canScrollTop is true", () => {
    const onScrollTop = vi.fn();
    renderStatusBar({ canScrollTop: true, onScrollTop });

    fireEvent.click(screen.getByRole("button", { name: "Scroll to top" }));
    expect(onScrollTop).toHaveBeenCalledTimes(1);
  });

  it("hides the scroll-to-top control when canScrollTop is false", () => {
    renderStatusBar({ canScrollTop: false });
    expect(screen.queryByRole("button", { name: "Scroll to top" })).toBeNull();
  });
});
