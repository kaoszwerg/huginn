import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AboutDialog } from "./AboutDialog";
import { APP_NAME } from "../lib/app";
import type { BuildInfo } from "../bindings/BuildInfo";

// AboutDialog imports this SVG for the app mark; the build pipeline normally provides it, jsdom needs a stub.
vi.mock("../../src-tauri/icons/icon.svg", () => ({ default: "icon.svg" }));

vi.mock("../api/commands", () => ({
  api: {
    buildInfo: vi.fn(),
  },
}));

import { api } from "../api/commands";

const build: BuildInfo = {
  version: "0.1.0",
  channel: "dev",
  debug: true,
  git_sha: "abc1234",
  git_dirty: false,
  commit_date: "2026-07-11T00:00:00Z",
};

function renderDialog() {
  const onClose = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <AboutDialog onClose={onClose} />
    </QueryClientProvider>,
  );
  return onClose;
}

describe("AboutDialog", () => {
  beforeEach(() => {
    vi.mocked(api.buildInfo).mockReset();
    vi.mocked(api.buildInfo).mockResolvedValue(build);
  });

  it("shows the app identity and the build metadata", async () => {
    renderDialog();
    expect(screen.getByRole("heading", { name: APP_NAME })).toBeInTheDocument();
    expect(await screen.findByText("v0.1.0")).toBeInTheDocument();
    expect(screen.getByText("dev")).toBeInTheDocument();
    expect(screen.getByText("abc1234")).toBeInTheDocument();
  });

  it("closes on the close button", () => {
    const onClose = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const onClose = renderDialog();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on a backdrop click but not on a click inside the panel", () => {
    const onClose = renderDialog();

    fireEvent.click(screen.getByRole("heading", { name: APP_NAME }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("presentation"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
