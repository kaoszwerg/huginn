import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { CrashBoundary } from "./CrashBoundary";

vi.mock("../api/commands", () => ({
  api: {
    reportCrash: vi.fn(() => Promise.resolve("/data/crashes/crash-1.log")),
    exitAfterCrash: vi.fn(() => Promise.resolve()),
  },
}));
const { api } = await import("../api/commands");
const reportCrashMock = vi.mocked(api.reportCrash);

function Boom(): React.ReactElement {
  throw new Error("render exploded");
}

describe("CrashBoundary", () => {
  // React logs the caught error to console.error by design; silence it so the suite output stays
  // readable, but assert on the boundary's behaviour, not on React's noise.
  beforeEach(() => {
    reportCrashMock.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("renders its children when nothing throws", () => {
    render(
      <CrashBoundary>
        <p>all good</p>
      </CrashBoundary>,
    );
    expect(screen.getByText("all good")).toBeInTheDocument();
  });

  it("replaces the failed tree with the fatal screen and never re-renders the children", async () => {
    render(
      <CrashBoundary>
        <Boom />
      </CrashBoundary>,
    );

    expect(await screen.findByText("Schwerwiegender Fehler")).toBeInTheDocument();
    expect(screen.getByText("render exploded")).toBeInTheDocument();
    // The failed unit is discarded, never resumed (rule:crash-handling): no "try again" that would put
    // the same broken tree back on screen.
    expect(screen.queryByRole("button", { name: /try again|retry|resume/i })).toBeNull();
  });

  it("reports the render crash to the durable on-device record", async () => {
    render(
      <CrashBoundary>
        <Boom />
      </CrashBoundary>,
    );

    await vi.waitFor(() =>
      expect(reportCrashMock).toHaveBeenCalledWith(
        expect.objectContaining({ source: "render", message: "render exploded" }),
      ),
    );
  });

  it("shows the user where the crash report is", async () => {
    render(
      <CrashBoundary>
        <Boom />
      </CrashBoundary>,
    );

    expect(await screen.findByText("/data/crashes/crash-1.log")).toBeInTheDocument();
  });

  it("still shows a fatal screen when the report itself cannot be delivered", async () => {
    reportCrashMock.mockRejectedValueOnce(new Error("ipc down"));

    render(
      <CrashBoundary>
        <Boom />
      </CrashBoundary>,
    );

    expect(await screen.findByText("Schwerwiegender Fehler")).toBeInTheDocument();
    expect(
      await screen.findByText(/Absturzbericht konnte nicht geschrieben werden/i),
    ).toBeInTheDocument();
  });
});
