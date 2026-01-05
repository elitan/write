# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Minimal markdown notes app for macOS. Tauri 2 (Rust backend) + React 19 + TypeScript + Tailwind CSS 4 + CodeMirror 6. Notes stored in `~/Notes`.

## Commands

Uses bun (not npm/pnpm).

```bash
bun run tauri dev     # dev mode with hot reload
bun run tauri build   # production build
bun run typecheck     # type check
bun run lint          # lint (biome)
bun run test          # run tests (vitest + cargo test)

# Release (triggers GitHub Action to build & publish)
# 1. Bump version in src-tauri/tauri.conf.json
# 2. Commit: git commit -am "Bump version to X.Y.Z"
# 3. Tag and push: git tag vX.Y.Z && git push && git push --tags
```

## Architecture

```
/src                  # React frontend
  app.tsx             # main component
  components/
    editor.tsx        # CodeMirror editor, autosave (800ms debounce)
    sidebar.tsx       # notes list
    command-palette.tsx  # fuzzy search (Fuse.js)
  hooks/
    use-files.ts      # note CRUD, file state
    use-settings.ts   # localStorage settings (vim mode)
    use-updater.ts    # Tauri updater integration

/src-tauri            # Rust backend
  src/lib.rs          # Tauri commands (file ops, title parsing)
  tauri.conf.json     # app config, updater, window settings
```

## Key Patterns

- Tauri commands in `lib.rs` invoked via `@tauri-apps/api/core`
- Title extracted from markdown H1 for sidebar display
- Settings persisted to localStorage
- Auto-updater checks GitHub releases every 15 min
- macOS only: overlay title bar, universal binary (aarch64 + x86_64)
