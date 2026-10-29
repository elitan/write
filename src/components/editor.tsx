import { useEffect, useLayoutEffect, useRef } from "react";
import { loadVim } from "../editor/extensions";
import * as session from "../editor/session";
import { editedAgo, fullTime, plural } from "../lib/format";
import { useNotes } from "../store/notes";
import { useSettings } from "../store/settings";
import { useUi } from "../store/ui";

function autosize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "0px";
  el.style.height = `${el.scrollHeight}px`;
}

function Meta() {
  const modified = useNotes(
    (s) => s.notes.find((n) => n.id === s.selectedId)?.modified,
  );
  const words = useNotes((s) => s.wordCount);
  const unsaved = useNotes(
    (s) => !s.notes.find((n) => n.id === s.selectedId)?.path,
  );
  if (modified === undefined) return null;
  return (
    <div className="mt-3 mb-6 flex items-center gap-2 font-sans text-[12px] text-fg-subtle">
      <span title={unsaved ? undefined : fullTime(modified)}>
        {unsaved ? "New note" : editedAgo(modified)}
      </span>
      <span className="text-fg-faint">·</span>
      <span className="tabular">{plural(words, "word")}</span>
    </div>
  );
}

export function Editor({ hidden }: { hidden: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const title = useNotes((s) => s.title);
  const selectedId = useNotes((s) => s.selectedId);
  const font = useSettings((s) => s.editorFont);
  const width = useSettings((s) => s.editorWidth);
  const size = useSettings((s) => s.textSize);
  const vimMode = useSettings((s) => s.vimMode);
  const spellcheck = useSettings((s) => s.spellcheck);
  const hideMarkdown = useSettings((s) => s.hideMarkdown);

  useLayoutEffect(() => {
    const view = session.createView(host.current!);
    session.attach(view, scroller.current!, titleRef.current!);
    return () => {
      session.detach();
      view.destroy();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const apply = () =>
      !cancelled && session.setConfig({ vimMode, spellcheck, hideMarkdown });
    if (vimMode) {
      loadVim().then(async () => {
        const { Vim } = await import("@replit/codemirror-vim");
        Vim.defineEx("quit", "q", () =>
          document.getElementById("note-list")?.focus(),
        );
        Vim.defineEx("write", "w", () => void session.flushAll());
        Vim.defineEx("wq", "wq", () => {
          void session.flushAll();
          document.getElementById("note-list")?.focus();
        });
        apply();
      });
    } else apply();
    return () => {
      cancelled = true;
    };
  }, [vimMode, spellcheck, hideMarkdown]);

  // Re-measure whenever the text, font or column width changes.
  useLayoutEffect(
    () => autosize(titleRef.current),
    [title, font, size, width, selectedId],
  );

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => useUi.setState({ titleScrolledAway: !entry.isIntersecting }),
      { root: scroller.current, rootMargin: "-8px 0px 0px 0px" },
    );
    observer.observe(titleRef.current!);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onResize = () => autosize(titleRef.current);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function onTitleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    const atEnd =
      el.selectionStart === el.value.length &&
      el.selectionEnd === el.value.length;
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      session.focusEditor("start");
    } else if (
      (e.key === "ArrowDown" && atEnd) ||
      (e.key === "Tab" && !e.shiftKey)
    ) {
      e.preventDefault();
      session.focusEditor("start");
    }
  }

  return (
    <div
      ref={scroller}
      className={`editor-root scroll h-full ${hidden ? "invisible" : ""}`}
      data-font={font}
      data-width={width}
      style={{ ["--editor-size" as string]: `${size}px` }}
      onMouseDown={(e) => {
        // Clicks in the margins land in the editor instead of nowhere.
        if (e.target === scroller.current) {
          e.preventDefault();
          session.focusEditor("end");
        }
      }}
    >
      <div className="editor-column pt-[clamp(24px,7vh,72px)]">
        <textarea
          ref={titleRef}
          rows={1}
          value={title}
          placeholder="Untitled"
          spellCheck={spellcheck}
          aria-label="Title"
          onChange={(e) => session.setTitle(e.target.value.replace(/\n/g, " "))}
          onKeyDown={onTitleKeyDown}
          className="editor-title"
        />
        <Meta />
        <div ref={host} />
      </div>
    </div>
  );
}
