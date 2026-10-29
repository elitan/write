import {
  CornerDownLeft,
  FilePlus2,
  FileText,
  FolderPlus,
  TextSearch,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { type Command, commands } from "../commands";
import { getApi, type SearchHit } from "../lib/api";
import { shortTime } from "../lib/format";
import { fuzzyFilter } from "../lib/fuzzy";
import * as actions from "../store/actions";
import { idForPath, type Note, useNotes } from "../store/notes";
import { closePalette, openDialog, useUi } from "../store/ui";
import { Dialog } from "./ui/dialog";
import { Kbd, Shortcut } from "./ui/kbd";
import { WorkspaceBadge } from "./workspace-badge";

interface Item {
  key: string;
  section: string;
  title: string;
  highlight?: number[];
  icon: React.ReactNode;
  detail?: React.ReactNode;
  snippet?: { text: string; start: number; length: number };
  run: () => void;
}

function Highlighted({ text, indices }: { text: string; indices?: number[] }) {
  if (!indices?.length) return <>{text}</>;
  const set = new Set(indices);
  const out: React.ReactNode[] = [];
  let run = "";
  let marked = false;
  const flush = (i: number) => {
    if (!run) return;
    out.push(
      marked ? (
        <mark key={i} className="bg-transparent font-semibold text-fg">
          {run}
        </mark>
      ) : (
        run
      ),
    );
    run = "";
  };
  for (let i = 0; i < text.length; i++) {
    const m = set.has(i);
    if (m !== marked) {
      flush(i);
      marked = m;
    }
    run += text[i];
  }
  flush(text.length);
  return <>{out}</>;
}

/** Drops leading list/quote/task markup so snippets read as prose. */
function cleanSnippet(hit: SearchHit) {
  const lead = /^[\s>#*+-]*(\[[ xX]\]\s+)?/.exec(hit.snippet)?.[0].length ?? 0;
  const cut = Math.min(lead, hit.matchStart);
  return {
    text: hit.snippet.slice(cut),
    start: hit.matchStart - cut,
    length: hit.matchLength,
  };
}

const noteIcon = <FileText size={15} strokeWidth={1.75} />;

function noteItem(
  note: Note,
  section: string,
  now: number,
  highlight?: number[],
): Item {
  return {
    key: `note:${note.id}`,
    section,
    title: note.title || "Untitled",
    highlight,
    icon: noteIcon,
    detail: (
      <span className="tabular text-[11px] text-fg-faint">
        {shortTime(note.modified, now)}
      </span>
    ),
    run: () => actions.selectNote(note.id, { focus: "body" }),
  };
}

function commandItem(c: Command, highlight?: number[]): Item {
  return {
    key: `cmd:${c.id}`,
    section: "Commands",
    title: c.title,
    highlight,
    icon: c.icon,
    detail: c.shortcut ? <Shortcut keys={c.shortcut} /> : undefined,
    run: c.run,
  };
}

export function CommandPalette() {
  const mode = useUi((s) => s.palette.mode);
  const notes = useNotes((s) => s.notes);
  const selectedId = useNotes((s) => s.selectedId);
  const workspaces = useNotes((s) => s.workspaces);
  const activeWs = useNotes((s) => s.activeWorkspaceId);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const pointerMoved = useRef(false);
  const now = useMemo(() => Date.now(), []);

  // Full-text search runs on the backend, debounced and race-safe.
  useEffect(() => {
    const q = query.trim();
    if (mode !== "all" || q.length < 2) {
      setHits([]);
      return;
    }
    let stale = false;
    const t = setTimeout(async () => {
      try {
        const result = await getApi().searchNotes(activeWs, q);
        if (!stale) setHits(result);
      } catch {
        if (!stale) setHits([]);
      }
    }, 90);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [query, mode, activeWs]);

  const items = useMemo<Item[]>(() => {
    const q = query.trim();
    const wsItems = (section: string): Item[] =>
      fuzzyFilter(q, workspaces, (w) => w.name).map(({ item: w, match }) => ({
        key: `ws:${w.id}`,
        section,
        title: w.name,
        highlight: match.indices,
        icon: <WorkspaceBadge name={w.name} size={16} />,
        detail:
          w.id === activeWs ? (
            <span className="text-[11px] text-fg-subtle">Current</span>
          ) : w.shortcut ? (
            <Shortcut keys={`mod+${w.shortcut}`} />
          ) : undefined,
        run: () => void actions.switchWorkspace(w.id),
      }));

    if (mode === "workspaces") {
      const list = wsItems("Workspaces");
      if (!q || "new workspace".includes(q.toLowerCase())) {
        list.push({
          key: "ws:new",
          section: "Workspaces",
          title: "New workspace…",
          highlight: undefined,
          icon: <FolderPlus size={15} strokeWidth={1.75} />,
          detail: undefined,
          run: () => openDialog({ type: "workspace-create" }),
        });
      }
      return list;
    }

    const available = commands.filter((c) => !c.when || c.when());
    if (!q) {
      const recent = [...notes]
        .filter((n) => n.id !== selectedId && n.path)
        .sort((a, b) => b.modified - a.modified)
        .slice(0, 6)
        .map((n) => noteItem(n, "Recent", now));
      return [...recent, ...available.map((c) => commandItem(c))];
    }

    const titleMatches = fuzzyFilter(
      q,
      notes,
      (n) => n.title || "Untitled",
    ).slice(0, 8);
    const matchedPaths = new Set(titleMatches.map((m) => m.item.path));
    const out: Item[] = titleMatches.map(({ item, match }) =>
      noteItem(item, "Notes", now, match.indices),
    );
    for (const hit of hits) {
      if (matchedPaths.has(hit.path) || out.length >= 18) continue;
      const id = idForPath(hit.path);
      out.push({
        key: `hit:${hit.path}`,
        section: "In notes",
        title: hit.title === "Untitled" ? "Untitled" : hit.title,
        icon: <TextSearch size={15} strokeWidth={1.75} />,
        snippet: cleanSnippet(hit),
        run: () =>
          actions.selectNote(id, {
            jump: { line: hit.line, column: hit.column, length: q.length },
          }),
      });
    }
    out.push(
      ...fuzzyFilter(q, available, (c) => `${c.title} ${c.keywords ?? ""}`)
        .slice(0, 6)
        .map(({ item, match }) =>
          commandItem(
            item,
            match.indices.filter((i) => i < item.title.length),
          ),
        ),
    );
    if (workspaces.length > 1) out.push(...wsItems("Workspaces").slice(0, 3));
    out.push({
      key: "create",
      section: "Create",
      title: `Create note “${q}”`,
      icon: <FilePlus2 size={15} strokeWidth={1.75} />,
      detail: <Shortcut keys="mod+enter" />,
      run: () => actions.createNote(q),
    });
    return out;
  }, [query, mode, notes, hits, workspaces, activeWs, selectedId, now]);

  useEffect(() => setActive(0), [query, mode]);
  useEffect(() => {
    if (active >= items.length) setActive(Math.max(0, items.length - 1));
  }, [items.length, active]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function run(item: Item | undefined) {
    if (!item) return;
    closePalette();
    item.run();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const move = (d: number) => {
      e.preventDefault();
      pointerMoved.current = false;
      setActive((i) =>
        items.length ? (i + d + items.length) % items.length : 0,
      );
    };
    if (
      e.key === "ArrowDown" ||
      (e.ctrlKey && (e.key === "n" || e.key === "j"))
    )
      move(1);
    else if (
      e.key === "ArrowUp" ||
      (e.ctrlKey && (e.key === "p" || e.key === "k"))
    )
      move(-1);
    else if (e.key === "Tab" && e.ctrlKey) move(e.shiftKey ? -1 : 1);
    else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if ((e.metaKey || e.ctrlKey) && query.trim() && mode === "all") {
        closePalette();
        actions.createNote(query.trim());
      } else run(items[active]);
    } else if (e.key === "Backspace" && !query && mode === "workspaces") {
      useUi.setState({ palette: { open: true, mode: "all" } });
    }
  }

  let lastSection = "";
  return (
    <Dialog
      onClose={closePalette}
      align="top"
      label="Command palette"
      className="max-w-[600px]"
    >
      <div className="flex h-[52px] items-center gap-3 border-line border-b px-4">
        {mode === "workspaces" && (
          <span className="shrink-0 rounded-md bg-hover px-1.5 py-0.5 text-[12px] text-fg-muted">
            Workspaces
          </span>
        )}
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            mode === "workspaces"
              ? "Switch to…"
              : "Search notes or type a command…"
          }
          spellCheck={false}
          role="combobox"
          aria-expanded
          aria-controls="palette-list"
          aria-activedescendant={`palette-${active}`}
          className="h-full flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-faint"
        />
      </div>

      <div
        id="palette-list"
        ref={listRef}
        role="listbox"
        className="scroll max-h-[min(420px,56vh)] p-1.5"
        onPointerMove={() => {
          pointerMoved.current = true;
        }}
      >
        {items.length === 0 && (
          <div className="px-3 py-10 text-center text-fg-subtle">
            No results
          </div>
        )}
        {items.map((item, i) => {
          const header =
            item.section !== lastSection && item.section !== "Create";
          lastSection = item.section;
          return (
            <div key={item.key}>
              {header && (
                <div className="px-2.5 pt-2.5 pb-1 text-[11px] font-medium text-fg-subtle">
                  {item.section}
                </div>
              )}
              <div
                id={`palette-${i}`}
                data-index={i}
                role="option"
                aria-selected={i === active}
                onPointerMove={() => pointerMoved.current && setActive(i)}
                onClick={() => run(item)}
                className={`flex items-center gap-3 rounded-lg px-2.5 ${item.snippet ? "py-2" : "h-9"} ${
                  i === active ? "bg-hover text-fg" : "text-fg-muted"
                } ${item.section === "Create" ? "mt-1" : ""}`}
              >
                <span
                  className={`flex size-4 shrink-0 items-center justify-center ${i === active ? "text-fg-muted" : "text-fg-subtle"}`}
                >
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    <Highlighted text={item.title} indices={item.highlight} />
                  </span>
                  {item.snippet && (
                    <span className="mt-0.5 block truncate text-[12px] text-fg-subtle">
                      {item.snippet.text.slice(0, item.snippet.start)}
                      <mark className="rounded-[3px] bg-accent-soft px-px text-fg">
                        {item.snippet.text.slice(
                          item.snippet.start,
                          item.snippet.start + item.snippet.length,
                        )}
                      </mark>
                      {item.snippet.text.slice(
                        item.snippet.start + item.snippet.length,
                      )}
                    </span>
                  )}
                </span>
                {item.detail}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex h-10 items-center gap-4 border-line border-t px-4 text-[12px] text-fg-subtle">
        <span className="flex items-center gap-1.5">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>
          Navigate
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>
            <CornerDownLeft size={10} />
          </Kbd>
          Open
        </span>
        {mode === "all" && query.trim() && (
          <span className="flex items-center gap-1.5">
            <Shortcut keys="mod+enter" />
            Create
          </span>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          <Kbd>Esc</Kbd>
          Close
        </span>
      </div>
    </Dialog>
  );
}
