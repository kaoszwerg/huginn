import { useRef } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useScrollTop } from "./useScrollTop";

/** Mirrors the App shell: a <main> with a scrolling child; the hook drives a status-bar-style button. */
function Harness({ resetKey = "a" }: { resetKey?: string }) {
  const ref = useRef<HTMLElement>(null);
  const { canTop, scrollToTop } = useScrollTop(ref, resetKey);
  return (
    <main ref={ref}>
      <div data-testid="scroller" style={{ overflow: "auto" }}>
        content
      </div>
      {canTop ? (
        <button aria-label="Scroll to top" onClick={scrollToTop}>
          top
        </button>
      ) : null}
    </main>
  );
}

describe("useScrollTop", () => {
  it("exposes the action past the threshold and scrolls the moved element to top", () => {
    render(<Harness />);
    const scroller = screen.getByTestId("scroller");
    const scrollTo = vi.fn();
    // jsdom has neither a real scrollTop nor scrollTo — stub both.
    Object.defineProperty(scroller, "scrollTop", { value: 400, configurable: true });
    Object.defineProperty(scroller, "scrollTo", { value: scrollTo, configurable: true });

    expect(screen.queryByLabelText("Scroll to top")).toBeNull();
    fireEvent.scroll(scroller); // caught on <main> in the capture phase
    fireEvent.click(screen.getByLabelText("Scroll to top"));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: expect.any(String) });
  });

  it("stays inactive for small scroll offsets", () => {
    render(<Harness />);
    const scroller = screen.getByTestId("scroller");
    Object.defineProperty(scroller, "scrollTop", { value: 50, configurable: true });
    fireEvent.scroll(scroller);
    expect(screen.queryByLabelText("Scroll to top")).toBeNull();
  });
});
