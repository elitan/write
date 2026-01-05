# Write

Minimal markdown notes app for macOS.

## Download

- [Apple Silicon](https://github.com/elitan/write/releases/latest/download/Write_aarch64.dmg) (M1/M2/M3/M4)
- [Intel](https://github.com/elitan/write/releases/latest/download/Write_x64.dmg)

## Usage

### Key Bindings

| Key | Action |
|-----|--------|
| `⌘K` | Command palette |
| `⌘N` | New note |
| `⌘,` | Settings |
| `⌘⌫` | Delete current note |
| `⌘⇧E` | Focus sidebar |
| `Ctrl+Tab` | Workspace switcher |
| `⌘1-9` | Switch to workspace |

### Sidebar Navigation

When sidebar is focused (`⌘⇧E`):

| Key | Action |
|-----|--------|
| `j` / `↓` | Move down |
| `k` / `↑` | Move up |
| `Enter` / `l` | Open note |
| `Esc` | Exit sidebar |

### Workspaces

Workspaces are separate folders for organizing notes. Each workspace lives in `~/Notes/<workspace-name>`.

- Open switcher: `Ctrl+Tab`
- Quick switch: `⌘1-9` (assign shortcuts in switcher)
- Create/rename/delete from the switcher

### Notes

- Notes are markdown files stored locally in `~/Notes`
- Autosave after 800ms of inactivity
- Drag notes in sidebar to reorder
- Vim mode available in settings (`⌘,`)

## Development

```bash
bun install
bun run tauri dev
```

## Build

```bash
bun run tauri build
```
