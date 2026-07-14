import { Component, type ErrorInfo, type ReactNode } from "react";
import { FatalScreen } from "./FatalScreen";
import { reportCrash } from "../lib/crash";

interface CrashBoundaryProps {
  children: ReactNode;
}

interface CrashBoundaryState {
  error: unknown;
  crashed: boolean;
  reportPath: string | null;
}

/**
 * The UI runtime's last-resort handler (ADR-CORE-037, ADR-APP-032).
 *
 * A React error boundary is the only construct that can catch a throw during render, and it must be a
 * class component — that is React's API, not a style choice. It catches, reports and **stops**: the
 * failed tree is replaced by {@link FatalScreen} and is never re-rendered. There is deliberately no
 * `reset()` and no "try again" — resuming a tree whose state nobody can vouch for is the swallowed
 * error at the top of the stack that `rule:crash-handling` forbids.
 *
 * It does NOT see errors thrown outside React's render/lifecycle path (event handlers, timers,
 * rejected promises) — those are covered by `installGlobalCrashHandlers` in `lib/crash.ts`. Both
 * entry points are needed; neither one substitutes for the other.
 */
export class CrashBoundary extends Component<CrashBoundaryProps, CrashBoundaryState> {
  state: CrashBoundaryState = { error: null, crashed: false, reportPath: null };

  static getDerivedStateFromError(error: unknown): Partial<CrashBoundaryState> {
    // Runs first and synchronously: the broken tree is off the screen before anything else happens.
    return { error, crashed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // `reportCrash` never rejects, so the fatal screen appears whether or not the record could be
    // written — an unreportable crash must still be a visible one.
    void reportCrash("render", error).then((reportPath) => {
      this.setState({ reportPath });
    });
    console.error("[crash] render tree failed", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.crashed) {
      return <FatalScreen error={this.state.error} reportPath={this.state.reportPath} />;
    }
    return this.props.children;
  }
}
