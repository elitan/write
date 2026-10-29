# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Minimal markdown notes app for macOS. Tauri 2 (Rust backend) + React 19 + TypeScript + Tailwind CSS 4 + CodeMirror 6 + zustand. Notes stored in `~/Documents/Notes/<workspace>/<n>-<slug>.md`.

## Commands

Uses bun (not npm/pnpm).

```bash
bun run tauri dev     # desktop app with hot reload
bun run dev           # browser only, uses src/lib/mock-api.ts (localStorage)
bun run typecheck
bun run lint          # biome
bun run test          # vitest
cd src-tauri && cargo test

# Release (triggers GitHub Action to build & publish)
# 1. Bump version in src-tauri/tauri.conf.json
# 2. Commit: git commit -am "Bump version to X.Y.Z"
# 3. Tag and push: git tag vX.Y.Z && git push && git push --tags
```

## Architecture

```
src/
  app.tsx               layout, global shortcuts, theme, focus/blur lifecycle
  commands.tsx          command registry (palette + shortcuts + settings list)
  lib/api.ts            backend interface; Tauri impl or mock-api.ts in a browser
  store/notes.ts        zustand state: workspaces, notes (stable ids), selection
  store/actions.ts      select/create/delete/reorder/workspace actions, history
  store/settings.ts     persisted preferences (localStorage "write-settings")
  store/ui.ts           palette, dialogs, toasts
  editor/session.ts     the single EditorView, per-note EditorState cache, autosave
  editor/extensions.ts  CodeMirror setup, compartments (vim, spellcheck, preview)
  editor/live-preview.ts  markdown decorations (hide syntax off the cursor line)
  editor/blocks.ts      block model over the markdown tree + move logic (pure, tested)
  editor/block-handles.ts  drag handle / drop indicator ViewPlugin
  components/           sidebar, note-list, editor, topbar, command-palette, dialogs

src-tauri/src/
  workspace.rs          workspaces.json config + workspace commands
  notes.rs              list/read/write/create/trash/restore/reorder
  search.rs             full-text search (UTF-16 offsets for JS)
```

## Key Patterns

- One `EditorView` for the app; switching notes swaps cached `EditorState`s. The title is a separate textarea, stored as the file's `# Title` line.
- Note ids are session-stable; `path` changes when the title or order changes (backend renames the file).
- All disk mutations go through `serial()` in `editor/session.ts` and a global lock in Rust, so writes and renames never interleave.
- New notes live in memory until they have content; blank new notes are dropped when you leave them.
- Deletes move files to the macOS Trash (`trash` crate) and toast an undo.
- Design tokens are CSS variables in `src/styles.css` (`data-theme` on `<html>`), exposed to Tailwind via `@theme inline`.
- macOS only: overlay title bar with `data-tauri-drag-region`; universal binary.
