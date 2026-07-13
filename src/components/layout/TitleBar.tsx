import type { ReactNode } from "react";
import { Minus, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { IconButton } from "../ui/IconButton";
import { useBuildInfo } from "../../hooks/useBuildInfo";
import { APP_NAME, APP_TAGLINE } from "../../lib/app";
import logoUrl from "../../../src-tauri/icons/icon.svg";

/** Frameless custom HUD title bar (ADR-APP-021). The bar is the drag region; the window controls sit in
 * a non-drag section. A DEV badge marks a development build (ADR-CORE-024). */
export function TitleBar() {
  const { data: build } = useBuildInfo();

  return (
    <header
      data-tauri-drag-region
      className="hud-strip hud-accent-cyan flex h-10 shrink-0 items-center justify-between pr-3 pl-5"
    >
      <div data-tauri-drag-region className="flex items-center gap-2">
        <img
          src={logoUrl}
          alt=""
          aria-hidden
          className="pointer-events-none h-6 w-6 shrink-0 select-none"
        />
        <span
          className="hud-label text-glow-cyan"
          style={
            {
              fontFamily: "Orbitron, sans-serif",
              "--hud-label-size": "0.8rem",
            } as React.CSSProperties
          }
        >
          {APP_NAME}
        </span>
        <span aria-hidden className="bg-dim/40 mx-0.5 h-3.5 w-px shrink-0" />
        <span
          data-tauri-drag-region
          className="text-green font-mono text-[11px] tracking-wide whitespace-nowrap"
        >
          {APP_TAGLINE}
        </span>
        {build?.channel === "dev" ? (
          <span className="hud-clip-sm hud-accent-gold neon-glow-gold bg-elevated px-1.5 py-0.5 text-[9px] font-bold tracking-widest text-[var(--huginn-gold)] uppercase">
            Dev
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5">
        <WinButton label="Minimize" onClick={() => void getCurrentWindow().minimize()}>
          <Minus size={15} strokeWidth={2.5} />
        </WinButton>
        <WinButton label="Maximize" onClick={() => void getCurrentWindow().toggleMaximize()}>
          <Square size={13} strokeWidth={2.5} />
        </WinButton>
        <WinButton label="Close" danger onClick={() => void getCurrentWindow().close()}>
          <X size={16} strokeWidth={2.5} />
        </WinButton>
      </div>
    </header>
  );
}

/** A single window control (minimize / maximize / close), drawn as a HUD `IconButton` for every OS
 * (ADR-APP-021). No tooltip — the accessible label alone identifies it, matching the OS window buttons. */
function WinButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <IconButton
      label={label}
      accent={danger ? "danger" : "cyan"}
      tooltip={null}
      onClick={onClick}
      className="h-7 w-7"
    >
      {children}
    </IconButton>
  );
}
