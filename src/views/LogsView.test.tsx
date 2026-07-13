import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LogsView } from "./LogsView";
import type { LogRecord } from "../bindings/LogRecord";

const clear = vi.fn();
const setPaused = vi.fn();

vi.mock("../hooks/useLogs", () => ({
  useLogs: vi.fn(),
}));

import { useLogs } from "../hooks/useLogs";

function rec(overrides: Partial<LogRecord> = {}): LogRecord {
  return {
    ts: "2026-07-11T10:00:00Z",
    level: "INFO",
    target: "app::boot",
    message: "hello",
    fields: "{}",
    ...overrides,
  };
}

function mockLogsState(overrides: Partial<ReturnType<typeof useLogs>> = {}) {
  vi.mocked(useLogs).mockReturnValue({
    logs: [],
    isLoading: false,
    error: null,
    clear,
    paused: false,
    setPaused,
    ...overrides,
  });
}

describe("LogsView", () => {
  beforeEach(() => {
    clear.mockReset();
    setPaused.mockReset();
  });

  it("shows a loading state while the initial snapshot is pending", () => {
    mockLogsState({ isLoading: true, logs: [] });
    render(<LogsView />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows an empty state when there are no records", () => {
    mockLogsState();
    render(<LogsView />);
    expect(screen.getByText("No log records.")).toBeInTheDocument();
  });

  it("shows an error state when the snapshot query fails", () => {
    mockLogsState({ error: new Error("boom") });
    render(<LogsView />);
    expect(screen.getByText(/Failed to load logs: boom/)).toBeInTheDocument();
  });

  it("filters rows by level", () => {
    mockLogsState({
      logs: [
        rec({ message: "info line", level: "INFO" }),
        rec({ message: "error line", level: "ERROR" }),
      ],
    });
    render(<LogsView />);
    expect(screen.getByText("info line")).toBeInTheDocument();
    expect(screen.getByText("error line")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ERROR" }));
    expect(screen.queryByText("info line")).toBeNull();
    expect(screen.getByText("error line")).toBeInTheDocument();
  });

  it("filters rows by the search box across message and target", () => {
    mockLogsState({
      logs: [
        rec({ message: "boot complete", target: "app::boot" }),
        rec({ message: "settings saved", target: "app::settings" }),
      ],
    });
    render(<LogsView />);

    fireEvent.change(screen.getByPlaceholderText("search…"), {
      target: { value: "settings" },
    });
    expect(screen.queryByText("boot complete")).toBeNull();
    expect(screen.getByText("settings saved")).toBeInTheDocument();
  });

  it("toggles pause and triggers clear", () => {
    mockLogsState({ logs: [rec()] });
    render(<LogsView />);

    fireEvent.click(screen.getByRole("button", { name: "Live" }));
    expect(setPaused).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it("shows the paused state as its own button label", () => {
    mockLogsState({ logs: [rec()], paused: true });
    render(<LogsView />);
    expect(screen.getByRole("button", { name: "Paused" })).toBeInTheDocument();
  });
});
