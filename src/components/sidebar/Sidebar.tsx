import { Home, ScrollText, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { IconButton } from "../ui/IconButton";
import { useUiStore, type ViewId } from "../../store/ui";

type NavItem = { id: ViewId; Icon: LucideIcon; label: string };

const MAIN_NAV: NavItem[] = [{ id: "home", Icon: Home, label: "Home" }];

const BOTTOM_NAV: NavItem[] = [
  { id: "logs", Icon: ScrollText, label: "Logs" },
  { id: "settings", Icon: Settings, label: "Settings" },
];

/** Left HUD navigation rail: main views at the top, logs/settings pinned to the bottom. */
export function Sidebar() {
  const view = useUiStore((s) => s.view);
  const setView = useUiStore((s) => s.setView);
  return (
    <nav
      className="hud-strip flex w-14 shrink-0 flex-col items-center gap-1.5 py-2"
      style={{
        borderRight: "1px solid rgb(var(--huginn-neon-cyan-rgb) / 0.3)",
        borderBottom: "none",
      }}
      aria-label="Primary"
    >
      {MAIN_NAV.map((item) => (
        <NavButton
          key={item.id}
          item={item}
          active={view === item.id}
          onClick={() => setView(item.id)}
        />
      ))}
      <div className="flex-1" />
      {BOTTOM_NAV.map((item) => (
        <NavButton
          key={item.id}
          item={item}
          active={view === item.id}
          onClick={() => setView(item.id)}
        />
      ))}
    </nav>
  );
}

/** One nav entry, drawn as a HUD `IconButton` (ADR-APP-026): the label is the accessible name and the
 * hover tooltip (replacing the native `title`); the active view fills green and is marked current. */
function NavButton({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}) {
  const { Icon } = item;
  return (
    <IconButton
      label={item.label}
      accent={active ? "green" : "cyan"}
      active={active}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className="h-9 w-9"
    >
      <Icon size={18} strokeWidth={2} />
    </IconButton>
  );
}
