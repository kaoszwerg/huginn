import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
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

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("root element not found");

// The window is transparent, so its rounded corners reveal the desktop behind them. The body must
// stay transparent or it would paint a hard rectangle straight over them.
document.body.classList.add("main-window");

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
