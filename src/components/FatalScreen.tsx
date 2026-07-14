import { AlertOctagon } from "lucide-react";
import { Panel } from "./ui/Panel";
import { Button } from "./ui/Button";
import { api } from "../api/commands";

interface FatalScreenProps {
  /** The value that was thrown. Anything is possible in JS — this is rendered defensively. */
  error: unknown;
  /** Path of the durable crash report, or `null` if the report could not be written. */
  reportPath: string | null;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  return typeof error === "string" ? error : String(error);
}

/**
 * The end of a render tree (ADR-CORE-037, ADR-APP-032).
 *
 * Shown when an error reached the top of the UI runtime with nobody left to handle it. It does NOT
 * offer to resume the failed tree — that tree is dead, and continuing on state nobody can vouch for is
 * exactly what `rule:crash-handling` forbids. The two exits it offers are both clean: a full reload (a
 * brand-new UI runtime, nothing carried over) or a deliberate, non-zero process exit.
 *
 * The text is hardcoded **German** (Huginn's first language, ADR-PROJ-010), not routed through i18next:
 * this is the last-resort screen and it must not depend on a runtime that may be exactly what broke.
 */
export function FatalScreen({ error, reportPath }: FatalScreenProps) {
  return (
    <div className="bg-bg flex h-screen w-screen items-center justify-center p-8">
      <div className="w-full max-w-xl" style={{ boxShadow: "var(--huginn-shadow)" }}>
        <Panel label="Schwerwiegender Fehler">
          <div className="flex items-start gap-4">
            <AlertOctagon
              size={26}
              strokeWidth={1.75}
              className="mt-0.5 shrink-0"
              style={{ color: "var(--huginn-danger)" }}
            />
            <div className="min-w-0 flex-1">
              <p className="text-fg mb-2 text-sm leading-relaxed">
                Die Oberfläche ist auf einen Fehler gestoßen, von dem sie sich nicht erholen konnte,
                und hat angehalten. Deine Einstellungen und Logs auf der Platte sind unberührt.
              </p>

              <p className="text-dim mb-4 font-mono text-xs break-words">{messageOf(error)}</p>

              <p className="text-dim mb-5 text-xs leading-relaxed">
                {reportPath ? (
                  <>
                    Ein Absturzbericht wurde nach{" "}
                    <span className="text-fg font-mono break-all">{reportPath}</span> geschrieben.
                    Er bleibt auf diesem Gerät — schick ihn mit, wenn du das meldest.
                  </>
                ) : (
                  <>
                    Der Absturzbericht konnte nicht geschrieben werden. Der Fehler steht dennoch im
                    Anwendungs-Log unter dem App-Datenverzeichnis.
                  </>
                )}
              </p>

              <div className="flex gap-3">
                <Button tone="accent" onClick={() => window.location.reload()}>
                  Oberfläche neu starten
                </Button>
                <Button
                  tone="danger"
                  variant="ghost"
                  onClick={() => {
                    // A failure to exit must not leave the user stuck on a dead screen with a dead
                    // button; it is logged like anything else (rule:logging).
                    void api.exitAfterCrash().catch((e) => console.error("[crash] exit failed", e));
                  }}
                >
                  Beenden
                </Button>
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
