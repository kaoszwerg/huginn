---
id: rule:ui-design
title: UI design
tldr: "HUD shell: content in HudPanels; every control a view touches is a HUD primitive — no stock element ever ships; handle empty/loading/error; accessible."
scope: frontend
load: conditional
triggers: [ui, layout, component, view, accessibility, button, dropdown, menu, context-menu, tooltip, dialog, native, primitive, control]
applies-to: ["src/components/**", "src/views/**"]
---

# UI design (ADR-APP-020, ADR-APP-021, ADR-APP-026)

- **No stock UI, ever (ADR-APP-026):** every interactive control a view touches — buttons, icon buttons,
  menus, context/right-click menus, dropdowns/selects, tooltips, inputs, dialogs — is a **reusable HUD
  primitive** from `src/components/ui/`. A view never renders a raw/native element, and never a component
  imported straight from a library: both are the same defect, a surface the user meets that nobody
  brought into line with the HUD.
- **Both halves are gated in `check:all`** — neither is a review habit:
  - native `<button>/<input>/<select>/<textarea>`, the `title` tooltip and `alert/confirm/prompt` are
    rejected outside the primitive layer;
  - **every runtime dependency is classified in `ui-boundary.json`** — `viewSafe` (renders nothing the
    user touches) or `primitiveOnly` (renders UI, importable **only** from `src/components/ui/**`). An
    **unclassified dependency fails the lint run**, so adding a UI kit stops the build until someone
    decides what it is. `ui-boundary.json` is project-owned: yours to write, never delivered by an
    update.
- **The primitive layer may build on anything; nothing may leak out of it.** `src/components/ui/**` is
  the one place allowed to sit on a native element — or on a **headless** library used purely as a
  mechanism (behaviour, a11y wiring, focus management, positioning). What must **never** escape it is the
  thing's own appearance: its stylesheet, theme, animations or default markup. **If the result still
  reads as itself in a screenshot, it is not finished** — that last part is held by review, not lint. A
  **styled/prebuilt** kit is the wrong tool here: you fight its skin instead of drawing the HUD.
- **Missing a primitive a feature needs?** Build it in `src/components/ui/` (with tests), to the existing
  design system — never reach for a native element in the view instead. Judge any library you build it on
  like any other dependency (rule:dependencies): justify it, check the licence, prefer the smaller one.
- **Composition:** content blocks render inside `HudPanel`s; a new view is a file under `src/views/`
  plus one entry in the sidebar nav and one branch in `App.tsx` — nothing else in the shell changes.
- **Window chrome:** frameless Tauri window; the custom TitleBar carries `data-tauri-drag-region`;
  window controls go through the Tauri window API (ADR-APP-021).
- **Robustness:** no overflow or breakout; handle empty, loading and error states for every view;
  respect reduced-motion. Avoid relying on `backdrop-filter` (weak on Linux WebKitGTK) — provide a
  solid fallback.
- **Accessibility:** semantic markup, focus states, sufficient contrast; the jsx-a11y lint must pass.
