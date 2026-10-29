import type {
  Api,
  NoteMeta,
  SearchHit,
  Workspace,
  WorkspaceState,
} from "./api";
import { parseContent, previewOf, slugify, titleOf } from "./markdown";

/**
 * In-browser stand-in for the Tauri backend, so the UI can be developed and
 * tested with `bun run dev` in any browser. Mirrors the Rust semantics:
 * `<n>-<slug>.md` files, highest number first.
 */

interface MockFile {
  content: string;
  modified: number;
}

interface MockDb {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  files: Record<string, MockFile>;
}

const STORAGE_KEY = "write-mock-db-v1";
const ROOT = "/Notes";

const WELCOME = `# Welcome to Write

Write is a fast, quiet place for plain-text notes. Everything is a markdown file in **~/Documents/Notes**, so your notes stay yours.

## The basics

- Press ⌘N for a new note, ⌘K to jump anywhere
- Titles become file names, and edits save as you type
- Drag notes in the sidebar to reorder them

## Markdown, rendered as you go

Use **bold**, *italic*, \`inline code\` and ~~strikethrough~~. Links like [the repo](https://github.com/elitan/write) open with ⌘-click.

- [x] Try a task list
- [ ] Toggle one with ⌘Enter
- [ ] Nest them with Tab

> Quotes look like this.

\`\`\`ts
const note = await write("hello");
\`\`\`

---

Open settings with ⌘, to switch themes, fonts and vim mode.
`;

const SEED: [string, string][] = [
  [
    "Personal",
    "# Reading list\n\n- *The Design of Everyday Things*, Don Norman\n- *A Philosophy of Software Design*, John Ousterhout\n- *Shape Up*, Ryan Singer\n",
  ],
  [
    "Personal",
    "# Weekend\n\n- [ ] Farmers market, oat milk and sourdough\n- [ ] Fix the bike's back brake\n- [x] Call grandma\n",
  ],
  [
    "Personal",
    "# Ideas\n\nA tiny app that turns voice memos into tidy markdown notes.\n\nMaybe a keyboard-first habit tracker?\n",
  ],
  ["Personal", WELCOME],
  [
    "Work",
    "# Q3 planning\n\n## Goals\n\n1. Ship the new onboarding\n2. Cut p95 latency in half\n3. Hire two engineers\n\n## Risks\n\n> Scope creep on onboarding. Keep it to three screens.\n",
  ],
  [
    "Work",
    "# 1:1 notes\n\n- Talked about growth areas: system design, writing\n- Follow up on the conference budget\n",
  ],
];

function seed(): MockDb {
  const now = Date.now();
  const files: Record<string, MockFile> = {};
  const counters: Record<string, number> = {};
  SEED.forEach(([ws, content], i) => {
    counters[ws] = (counters[ws] ?? 0) + 1;
    const n = counters[ws];
    const ageHours = [30, 50, 120, 0.05, 3, 26][i] ?? i;
    files[`${ROOT}/${ws}/${n}-${slugify(titleOf(content))}.md`] = {
      content,
      modified: now - ageHours * 3_600_000,
    };
  });
  return {
    workspaces: [
      { id: "Personal", name: "Personal", shortcut: "1" },
      { id: "Work", name: "Work", shortcut: "2" },
    ],
    activeWorkspaceId: "Personal",
    files,
  };
}

function load(): MockDb {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // Fall through to a fresh seed.
  }
  return seed();
}

function fileName(path: string) {
  return path.slice(path.lastIndexOf("/") + 1, -3);
}

function fileNumber(path: string) {
  const name = fileName(path);
  const dash = name.indexOf("-");
  const n = dash > 0 ? Number(name.slice(0, dash)) : Number.NaN;
  return Number.isFinite(n) ? n : null;
}

function titleSlug(content: string) {
  return slugify(parseContent(content).title).slice(0, 80) || "untitled";
}

const delay = (ms = 4) => new Promise((r) => setTimeout(r, ms));

export function createMockApi(): Api {
  const db = load();
  const persist = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch {
      // Storage full or blocked: keep working in memory.
    }
  };

  persist();

  const dir = (ws: string) => `${ROOT}/${ws}/`;
  const pathsIn = (ws: string) =>
    Object.keys(db.files).filter(
      (p) => p.startsWith(dir(ws)) && !p.slice(dir(ws).length).includes("/"),
    );
  const meta = (path: string): NoteMeta => ({
    path,
    title: titleOf(db.files[path].content),
    preview: previewOf(db.files[path].content),
    modified: db.files[path].modified,
  });
  const sorted = (ws: string) =>
    pathsIn(ws).sort((a, b) => {
      const na = fileNumber(a);
      const nb = fileNumber(b);
      if (na !== null && nb !== null) return nb - na;
      if (na !== null) return -1;
      if (nb !== null) return 1;
      return db.files[b].modified - db.files[a].modified;
    });
  const nextNumber = (ws: string) =>
    Math.max(0, ...pathsIn(ws).map((p) => fileNumber(p) ?? 0)) + 1;
  const wsOf = (path: string) => path.slice(ROOT.length + 1).split("/")[0];
  const snapshot = (): WorkspaceState => ({
    workspaces: structuredClone(db.workspaces),
    activeWorkspaceId: db.activeWorkspaceId,
  });
  const need = (path: string) => {
    if (!db.files[path]) throw new Error(`No such note: ${path}`);
    return db.files[path];
  };

  return {
    async getWorkspaces() {
      return snapshot();
    },
    async setActiveWorkspace(id) {
      db.activeWorkspaceId = id;
      persist();
    },
    async createWorkspace(name) {
      const id = slugify(name.trim());
      if (!id) throw "Enter a name with at least one letter or number";
      if (db.workspaces.some((w) => w.id.toLowerCase() === id)) {
        throw `A workspace named “${name.trim()}” already exists`;
      }
      const used = new Set(db.workspaces.map((w) => w.shortcut));
      const shortcut =
        ["1", "2", "3", "4", "5", "6", "7", "8", "9"].find(
          (s) => !used.has(s),
        ) ?? null;
      const ws = { id, name: name.trim(), shortcut };
      db.workspaces.push(ws);
      persist();
      return ws;
    },
    async renameWorkspace(id, name) {
      if (!name.trim()) throw "Name can't be empty";
      const ws = db.workspaces.find((w) => w.id === id);
      if (!ws) throw "Workspace not found";
      ws.name = name.trim();
      persist();
      return { ...ws };
    },
    async deleteWorkspace(id) {
      if (db.workspaces.length <= 1) throw "You need at least one workspace";
      db.workspaces = db.workspaces.filter((w) => w.id !== id);
      if (db.activeWorkspaceId === id)
        db.activeWorkspaceId = db.workspaces[0].id;
      persist();
      return snapshot();
    },

    async listNotes(ws) {
      await delay();
      return sorted(ws).map(meta);
    },
    async readNote(path) {
      const file = need(path);
      return { content: file.content, modified: file.modified };
    },
    async writeNote(path, content) {
      need(path);
      db.files[path] = { content, modified: Date.now() };
      let next = path;
      const n = fileNumber(path);
      if (n !== null) {
        const target = `${path.slice(0, path.lastIndexOf("/") + 1)}${n}-${titleSlug(content)}.md`;
        if (target !== path && !db.files[target]) {
          db.files[target] = db.files[path];
          delete db.files[path];
          next = target;
        }
      }
      persist();
      return meta(next);
    },
    async createNote(ws, content) {
      const path = `${dir(ws)}${nextNumber(ws)}-${titleSlug(content)}.md`;
      db.files[path] = { content, modified: Date.now() };
      persist();
      return meta(path);
    },
    async trashNote(path) {
      need(path);
      delete db.files[path];
      persist();
    },
    async restoreNote(path, content) {
      const target = db.files[path]
        ? `${dir(wsOf(path))}${nextNumber(wsOf(path))}-${titleSlug(content)}.md`
        : path;
      db.files[target] = { content, modified: Date.now() };
      persist();
      return meta(target);
    },
    async reorderNotes(ws, order) {
      const existing = new Set(pathsIn(ws));
      const ordered = order.filter((p) => existing.has(p));
      for (const p of sorted(ws)) if (!ordered.includes(p)) ordered.push(p);
      const total = ordered.length;
      const moves = ordered
        .map((from, i) => {
          const number = total - i;
          if (fileNumber(from) === number) return null;
          const name = fileName(from);
          const slug = name.includes("-")
            ? name.slice(name.indexOf("-") + 1)
            : name;
          return { from, to: `${dir(ws)}${number}-${slug}.md` };
        })
        .filter((m): m is { from: string; to: string } => m !== null);
      const staged = moves.map((m) => ({ ...m, file: db.files[m.from] }));
      for (const m of staged) delete db.files[m.from];
      for (const m of staged) db.files[m.to] = m.file;
      persist();
      return moves;
    },
    async searchNotes(ws, query) {
      await delay(12);
      const q = query.trim().toLowerCase();
      if (!q) return [];
      const hits: SearchHit[] = [];
      for (const path of sorted(ws)) {
        const { content } = db.files[path];
        const lines = content.split("\n");
        const titleLine = lines.findIndex((l) => l.startsWith("# "));
        for (let i = 0; i < lines.length; i++) {
          if (i === titleLine) continue;
          const at = lines[i].toLowerCase().indexOf(q);
          if (at === -1) continue;
          const start = Math.max(0, at - 32);
          const raw = lines[i].slice(start, start + 120);
          const trimmed = raw.trimStart();
          const prefix =
            start > 0 && lines[i].slice(0, start).trim() ? "…" : "";
          hits.push({
            path,
            title: titleOf(content),
            snippet: prefix + trimmed,
            matchStart:
              prefix.length + at - start - (raw.length - trimmed.length),
            matchLength: q.length,
            line: i,
            column: at,
          });
          break;
        }
        if (hits.length >= 40) break;
      }
      return hits;
    },
    async revealInFinder(path) {
      console.info("[mock] reveal in Finder:", path);
    },
    async openUrl(url) {
      window.open(url, "_blank", "noopener");
    },
  };
}
