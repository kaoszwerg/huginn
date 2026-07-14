import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUp, ChevronRight, File as FileIcon, Folder, Home } from "lucide-react";
import { Panel } from "./ui/Panel";
import { Button } from "./ui/Button";
import { IconButton } from "./ui/IconButton";
import { Notice } from "./ui/Notice";
import { useDirectory } from "../hooks/useDirectory";

interface FilePickerProps {
  /** The dialog heading — the caller says what is being picked ("Choose a model file"). */
  heading: string;
  /** File extensions (without the dot) that may be selected; other files are hidden. Omit for any file. */
  extensions?: string[];
  /** Called with the chosen file's absolute path. The picker closes itself afterwards. */
  onSelect: (path: string) => void;
  /** Called when the user cancels (button, Escape, or a backdrop click). */
  onClose: () => void;
}

/**
 * The in-app file picker (ADR-PROJ-006, rule:design-system) — a design-system modal, not a native OS
 * dialog: every control the user touches is a HUD primitive (ADR-APP-026), so it looks and behaves
 * like the rest of Huginn on every platform. It is the click-to-browse fallback to drag-and-drop
 * (`FileDropZone`) for importing a model file.
 *
 * It only ever *lists* directories (`useDirectory` → the read-only `list_directory` command); the file
 * it returns is validated in the backend before a byte is read (ADR-CORE-011). Closes on the Cancel
 * button, on Escape, or on a backdrop click.
 */
export function FilePicker({ heading, extensions, onSelect, onClose }: FilePickerProps) {
  const { t } = useTranslation();
  // `null` → the home directory, resolved by the backend (rule:cross-platform).
  const [path, setPath] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const listing = useDirectory(path);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const matches = (name: string) => {
    if (!extensions || extensions.length === 0) return true;
    return extensions.some((ext) => name.toLowerCase().endsWith(`.${ext.toLowerCase()}`));
  };

  const navigate = (to: string | null) => {
    setSelected(null);
    setPath(to);
  };

  const confirm = (filePath: string) => {
    onSelect(filePath);
    onClose();
  };

  const entries = listing.data?.entries ?? [];
  const visible = entries.filter((e) => e.is_dir || matches(e.name));
  const parent = listing.data?.parent ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-8"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-md"
        style={{ boxShadow: "var(--huginn-shadow)" }}
        data-testid="filepicker"
      >
        <Panel label={heading}>
          <div className="flex flex-col gap-3">
            {/* Where we are, and the two ways out of it — one level up, or back to home. */}
            <div className="flex items-center gap-2">
              <IconButton
                label={t("filepicker.up")}
                onClick={() => navigate(parent)}
                disabled={parent === null}
                data-testid="filepicker-up"
              >
                <ArrowUp size={15} strokeWidth={2} />
              </IconButton>
              <IconButton
                label={t("filepicker.home")}
                onClick={() => navigate(null)}
                data-testid="filepicker-home"
              >
                <Home size={15} strokeWidth={2} />
              </IconButton>
              <span
                className="text-dim min-w-0 flex-1 truncate font-mono text-xs"
                data-testid="filepicker-path"
              >
                {listing.data?.path ?? "…"}
              </span>
            </div>

            <div className="border-line h-64 overflow-y-auto rounded-[var(--radius-control)] border">
              {listing.isError ? (
                <div className="p-3">
                  <Notice tone="danger">
                    {t("filepicker.readFailed")}{" "}
                    {listing.error instanceof Error ? listing.error.message : ""}
                  </Notice>
                </div>
              ) : listing.isLoading ? (
                <p className="text-dim p-3 text-xs">{t("filepicker.loading")}</p>
              ) : visible.length === 0 ? (
                <p className="text-dim p-3 text-xs">{t("filepicker.empty")}</p>
              ) : (
                <ul className="flex flex-col p-1">
                  {visible.map((entry) =>
                    entry.is_dir ? (
                      <li key={entry.path}>
                        <Button
                          variant="ghost"
                          className="w-full justify-start gap-2"
                          onClick={() => navigate(entry.path)}
                          data-testid="filepicker-entry"
                        >
                          <Folder size={14} strokeWidth={2} className="text-accent shrink-0" />
                          <span className="min-w-0 flex-1 truncate text-left">{entry.name}</span>
                          <ChevronRight size={14} className="text-dim shrink-0" />
                        </Button>
                      </li>
                    ) : (
                      <li key={entry.path}>
                        <Button
                          variant="ghost"
                          active={selected === entry.path}
                          aria-pressed={selected === entry.path}
                          className="w-full justify-start gap-2"
                          onClick={() => setSelected(entry.path)}
                          onDoubleClick={() => confirm(entry.path)}
                          data-testid="filepicker-entry"
                        >
                          <FileIcon size={14} strokeWidth={2} className="text-dim shrink-0" />
                          <span className="min-w-0 flex-1 truncate text-left">{entry.name}</span>
                        </Button>
                      </li>
                    ),
                  )}
                </ul>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose} data-testid="filepicker-cancel">
                {t("filepicker.cancel")}
              </Button>
              <Button
                tone="accent"
                disabled={selected === null}
                onClick={() => selected && confirm(selected)}
                data-testid="filepicker-select"
              >
                {t("filepicker.select")}
              </Button>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
