import type { ReactNode } from "react";
import { Minus, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { IconButton } from "../ui/IconButton";
import { useBuildInfo } from "../../hooks/useBuildInfo";
import { APP_NAME } from "../../lib/app";
import logoUrl from "../../../src-tauri/icons/icon.svg";

/**
 * The frameless window's own title bar (ADR-APP-021, ADR-PROJ-003). The bar is the drag region; the
 * window controls sit outside it so a click on them does not start a drag. A DEV badge marks a
 * development build (ADR-CORE-024) — quietly, in the warning tone, not as a neon sticker.
 */
export function TitleBar() {
  const { data: build } = useBuildInfo();

  return (
    <header
      data-tauri-drag-region
      className="bg-surface border-line flex h-10 shrink-0 items-center justify-between border-b pr-2 pl-4"
    >
      <div data-tauri-drag-region className="flex items-center gap-2">
        <img
          src={logoUrl}
          alt=""
          aria-hidden
          className="pointer-events-none h-5 w-5 shrink-0 select-none"
        />
        <span data-tauri-drag-region className="text-fg text-sm font-semibold tracking-tight">
          {APP_NAME}
        </span>
        {build?.channel === "dev" ? (
          <span className="border-warning text-warning ml-1 rounded-[4px] border px-1.5 py-px text-[10px] font-medium tracking-wider uppercase">
            Dev
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-0.5">
        <WinButton label="Minimize" onClick={() => void getCurrentWindow().minimize()}>
          <Minus size={15} strokeWidth={2} />
        </WinButton>
        <WinButton label="Maximize" onClick={() => void getCurrentWindow().toggleMaximize()}>
          <Square size={12} strokeWidth={2} />
        </WinButton>
        <WinButton label="Close" danger onClick={() => void getCurrentWindow().close()}>
          <X size={16} strokeWidth={2} />
        </WinButton>
      </div>
    </header>
  );
}

/**
 * One window control, drawn by us on every OS (ADR-APP-021) rather than left to the platform. No
 * tooltip: the accessible label names it, and a bubble popping up under the close button every time
 * the pointer passes by would be noise.
 */
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
      tone={danger ? "danger" : "neutral"}
      tooltip={null}
      onClick={onClick}
      className="h-7 w-8"
    >
      {children}
    </IconButton>
  );
}
