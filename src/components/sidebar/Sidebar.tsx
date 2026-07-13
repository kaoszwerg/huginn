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

/** The navigation rail: product views at the top, logs and settings pinned to the bottom. */
export function Sidebar() {
  const view = useUiStore((s) => s.view);
  const setView = useUiStore((s) => s.setView);

  return (
    <nav
      className="bg-surface border-line flex w-14 shrink-0 flex-col items-center gap-1 border-r py-2"
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

/**
 * One nav entry (ADR-APP-026): the label is both the accessible name and the hover tooltip. The
 * current view is marked with `aria-current` *and* visually — state must never be carried by colour
 * alone, and a screen reader cannot see a highlight.
 */
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
      active={active}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className="h-9 w-9"
    >
      <Icon size={18} strokeWidth={active ? 2.25 : 1.75} />
    </IconButton>
  );
}
