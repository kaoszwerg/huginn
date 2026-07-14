import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, X } from "lucide-react";
import { useState } from "react";
import { IconButton } from "./ui/IconButton";
import { api } from "../api/commands";

/**
 * Tells the user that the PREVIOUS run crashed, and where the report is (ADR-CORE-037, ADR-APP-032).
 *
 * This is the backstop behind the native message box. A process that dies before it has a window — or
 * on a desktop with no dialog binary to call — cannot show the user anything at the time. The crash
 * still left a marker on disk, so the next launch is where they finally learn about it. Without this, a
 * startup crash is exactly the "binary that exits with no output" ADR-CORE-037 exists to prevent.
 *
 * The marker is consumed by the backend on read, so the notice appears once and does not nag.
 */
export function CrashNotice() {
  const [dismissed, setDismissed] = useState(false);

  // `staleTime: Infinity` + no refetch: the backend clears the marker when it hands it over, so asking
  // twice would return null and make the notice vanish under the user.
  const { data: reportPath } = useQuery({
    queryKey: ["pending-crash"],
    queryFn: () => api.pendingCrash(),
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  if (!reportPath || dismissed) return null;

  return (
    <div
      role="alert"
      className="surface-panel mx-3 mb-2 flex items-start gap-3 p-3"
      style={{ boxShadow: "0 0 0 1px rgb(var(--huginn-danger-rgb) / 0.5)" }}
    >
      <AlertTriangle
        size={16}
        strokeWidth={2}
        className="mt-0.5 shrink-0"
        style={{ color: "var(--huginn-danger)" }}
      />
      <div className="min-w-0 flex-1 text-xs leading-relaxed">
        <span className="text-fg">Die letzte Sitzung endete mit einem Absturz.</span>{" "}
        <span className="text-dim">
          Ein Bericht wurde nach <span className="font-mono break-all">{reportPath}</span>{" "}
          gespeichert. Er bleibt auf diesem Gerät.
        </span>
      </div>
      <IconButton
        label="Schließen"
        variant="ghost"
        tooltip="Schließen"
        onClick={() => setDismissed(true)}
        className="text-dim shrink-0"
      >
        <X size={14} strokeWidth={2} />
      </IconButton>
    </div>
  );
}
