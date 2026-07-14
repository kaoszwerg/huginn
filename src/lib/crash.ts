// The frontend's last-resort reporting path (ADR-CORE-037, ADR-APP-032).
//
// The UI is a SECOND entry point: a panic hook in Rust cannot see an error thrown inside the webview,
// and a user staring at a blank window is being told nothing. Everything here therefore has one job —
// get the failure into the durable, on-device record before the UI gives up. It never resumes, and it
// never swallows: the crash is reported, the user is shown a fatal screen, and that is the end of that
// render tree (rule:crash-handling).
import { api } from "../api/commands";

/** Where the failure came in — recorded verbatim in the crash report so the two runtimes stay apart. */
export type CrashSource = "render" | "uncaught" | "unhandledrejection";

/** Normalise anything JavaScript permits as a throw value into a message + optional stack. */
function describe(value: unknown): { message: string; stack: string | null } {
  if (value instanceof Error) {
    return { message: value.message || value.name, stack: value.stack ?? null };
  }
  if (typeof value === "string") return { message: value, stack: null };
  try {
    return { message: JSON.stringify(value) ?? String(value), stack: null };
  } catch {
    // A value that cannot even be stringified (a circular object, a Proxy that throws) must still
    // produce a report — an unreportable crash is the one thing this module exists to prevent.
    return { message: String(value), stack: null };
  }
}

/**
 * Send a fatal frontend error to the backend, which logs it through `tracing` and writes the durable
 * crash file (ADR-APP-032).
 *
 * Resolves to the crash report's path, or `null` when the report itself could not be delivered — it
 * NEVER rejects. The caller is already handling a fatal error and has no way to handle a second one;
 * a throw from here would replace the real crash with a misleading one. The delivery failure is logged
 * to the console instead, never silently dropped (rule:logging).
 */
export async function reportCrash(source: CrashSource, value: unknown): Promise<string | null> {
  const { message, stack } = describe(value);
  try {
    return await api.reportCrash({ source, message, stack });
  } catch (reportError) {
    console.error(
      `[crash] the crash report could not be delivered to the backend (${String(reportError)}). ` +
        `Original ${source} failure:`,
      value,
    );
    return null;
  }
}

/**
 * Install the window-level last-resort handlers: an uncaught error and an unhandled promise rejection
 * are both fatal, both reported, and both raised to `onFatal` (with the crash report's path) so the
 * shell can show the fatal screen.
 *
 * These cover what a React error boundary structurally cannot see — a throw in an event handler, in a
 * `setTimeout`, or a rejected promise nobody awaited. The report is sent from here rather than from the
 * fatal screen on purpose: the record must survive even if React itself is the thing that is broken.
 *
 * Returns an uninstall function (used by tests; the app keeps the handlers for the process lifetime).
 */
export function installGlobalCrashHandlers(
  onFatal: (error: unknown, reportPath: string | null) => void,
): () => void {
  const handle = (source: CrashSource, value: unknown) => {
    void reportCrash(source, value).then((reportPath) => onFatal(value, reportPath));
  };

  const handleError = (event: ErrorEvent) => handle("uncaught", event.error ?? event.message);
  const handleRejection = (event: Event) =>
    handle("unhandledrejection", (event as Event & { reason?: unknown }).reason);

  window.addEventListener("error", handleError);
  window.addEventListener("unhandledrejection", handleRejection);

  return () => {
    window.removeEventListener("error", handleError);
    window.removeEventListener("unhandledrejection", handleRejection);
  };
}
