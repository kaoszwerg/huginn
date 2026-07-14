import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { CrashBoundary } from "./components/CrashBoundary";
import { FatalScreen } from "./components/FatalScreen";
import { installGlobalCrashHandlers, reportCrash } from "./lib/crash";
// Initialises i18next before the first component renders (ADR-PROJ-010). German is the default and
// the fallback: an untranslated key must degrade to a language, not to a raw identifier.
import "./i18n";
import "./styles/globals.css";

// No webfont is loaded on purpose (ADR-PROJ-003): Huginn draws in the system face, so it reads like
// part of the user's desktop rather than like a brand — and ships nothing to download or embed.

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: false,
    },
  },
});

// The UI is its own entry point (ADR-CORE-037, ADR-APP-032): the Rust panic hook cannot see anything
// thrown in here, so the webview installs its own last-resort handlers — before the first render, so a
// failure during the initial mount is caught too. That failure is the one a user would otherwise meet
// as a blank window with nothing recorded.
const missingMount = document.getElementById("root") === null;
const mount =
  document.getElementById("root") ?? document.body.appendChild(document.createElement("div"));
const reactRoot = ReactDOM.createRoot(mount);

/** Replace whatever is on screen with the fatal screen. The failed tree is discarded, never resumed. */
const showFatal = (error: unknown, reportPath: string | null) =>
  reactRoot.render(<FatalScreen error={error} reportPath={reportPath} />);

installGlobalCrashHandlers(showFatal);

// The window is transparent, so its rounded corners reveal the desktop behind them. The body must
// stay transparent or it would paint a hard rectangle straight over them.
document.body.classList.add("main-window");

if (missingMount) {
  // `index.html` did not contain the mount point this bundle is built against — the artefact is not
  // what we shipped, so we do not run the app on top of it. Previously a bare `throw` at module scope:
  // no log, no record, no window, on a build with no console attached (ADR-APP-032).
  const error = new Error("mount point #root is missing from index.html");
  void reportCrash("uncaught", error).then((reportPath) => showFatal(error, reportPath));
} else {
  reactRoot.render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <CrashBoundary>
          <App />
        </CrashBoundary>
      </QueryClientProvider>
    </React.StrictMode>,
  );
}
