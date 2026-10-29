# Write

Fast, minimal markdown notes for macOS. Your notes are plain `.md` files in `~/Documents/Notes`.

## Download

- [Apple Silicon](https://github.com/elitan/write/releases/latest/download/Write_aarch64.dmg) (M1/M2/M3/M4)
- [Intel](https://github.com/elitan/write/releases/latest/download/Write_x64.dmg)

## Features

- **Live preview**: markdown renders as you type and the raw syntax shows only where your cursor is
- **Blocks you can drag**: hover any paragraph, heading, list item or code block and drag its ⋮⋮ handle to move it (nested items come along), or use `⌘⇧↑`/`⌘⇧↓`
- **⌘K for everything**: fuzzy note titles, full-text search across the workspace (jumps to the match), and every command
- **Instant switching**: notes keep their undo history, cursor and scroll position while you hop between them
- **Safe by default**: autosave with atomic writes, deletes go to the macOS Trash with one-click undo
- **Workspaces**: separate folders, switch with `⌃Tab` or `⌘1–9`
- Light and dark themes, sans/serif/mono fonts, adjustable width, optional vim mode

## Keyboard

| Key | Action |
|-----|--------|
| `⌘K` / `⌘P` | Search notes and commands |
| `⌘N` | New note |
| `⌘⌫` | Delete note (from the list; `⌘⇧⌫` anywhere) |
| `⌘F` | Find in note |
| `⌘\` | Toggle sidebar |
| `⌘⇧E` | Focus note list (`j`/`k` to move, `Enter` to edit) |
| `⌘[` / `⌘]` | Back / forward |
| `⌃Tab` | Switch workspace |
| `⌘1–9` | Jump to workspace |
| `⌘+` / `⌘−` / `⌘0` | Larger / smaller / default text size |
| `⌘,` | Settings |
| `⌘/` | All shortcuts |

Editing: `⌘B` bold, `⌘I` italic, `⌘E` code, `⌘⇧X` strikethrough, `⌘Enter` toggle task, `[]` starts a task, `⌘⇧↑`/`⌘⇧↓` move block, `⌘`-click opens links, paste a URL over selected text to link it.

## Storage

Each workspace is a folder in `~/Documents/Notes/<workspace>`. Notes are named `<number>-<slug>.md`: the number is the sidebar order and the slug follows the note's `# Title`. Edit them with any other app; Write picks up changes when its window regains focus.

## Development

```bash
bun install
bun run tauri dev   # desktop app
bun run dev         # browser only, against an in-memory mock backend
```

```bash
bun run typecheck && bun run lint && bun run test
cd src-tauri && cargo test
```

## Build

```bash
bun run tauri build
```
