import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import {
  HighlightStyle,
  syntaxHighlighting,
  syntaxTree,
} from "@codemirror/language";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { Vim, vim } from "@replit/codemirror-vim";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useRef } from "react";
import { useNotesStore } from "../stores/notes-store";

const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading1, fontSize: "1.6em", fontWeight: "600" },
  { tag: tags.heading2, fontSize: "1.4em", fontWeight: "600" },
  { tag: tags.heading3, fontSize: "1.2em", fontWeight: "600" },
  { tag: tags.heading4, fontSize: "1.1em", fontWeight: "600" },
  { tag: tags.heading5, fontSize: "1.05em", fontWeight: "600" },
  { tag: tags.heading6, fontSize: "1em", fontWeight: "600" },
  { tag: tags.strong, fontWeight: "600" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.monospace, fontFamily: "var(--font-mono)" },
  { tag: tags.link, color: "var(--color-accent)" },
  { tag: tags.url, color: "var(--color-muted)" },
  { tag: tags.quote, color: "var(--color-muted)", fontStyle: "italic" },
  {
    tag: tags.processingInstruction,
    color: "var(--color-muted)",
    opacity: "0.6",
  },
]);

const clickableLinks = EditorView.domEventHandlers({
  click(event, view) {
    if (!event.metaKey && !event.ctrlKey) return false;
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos === null) return false;
    const tree = syntaxTree(view.state);
    let url: string | null = null;
    tree.iterate({
      from: pos,
      to: pos,
      enter(node) {
        if (node.name === "URL") {
          url = view.state.sliceDoc(node.from, node.to);
        }
      },
    });
    if (url) {
      openUrl(url);
      return true;
    }
    return false;
  },
});

interface EditorProps {
  vimMode: boolean;
  onClose: () => void;
}

export function Editor({ vimMode, onClose }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const vimCompartment = useRef(new Compartment());

  const selectedPath = useNotesStore((s) => s.selectedPath);
  const noteContent = useNotesStore((s) => s.noteContent);
  const isCreating = useNotesStore((s) => s.isCreating);
  const setTitle = useNotesStore((s) => s.setTitle);
  const setBody = useNotesStore((s) => s.setBody);
  const flush = useNotesStore((s) => s.flush);

  useEffect(() => {
    if (!vimMode) return;
    Vim.defineEx("q", "q", onClose);
    Vim.defineEx("wq", "wq", async () => {
      await flush();
      onClose();
    });
  }, [vimMode, onClose, flush]);

  useEffect(() => {
    if (!noteContent) return;
    setTimeout(() => {
      if (!noteContent.title) {
        titleInputRef.current?.focus();
      } else {
        viewRef.current?.focus();
      }
    }, 0);
  }, [selectedPath]);

  useEffect(() => {
    if (!containerRef.current || !noteContent) return;

    if (viewRef.current) {
      viewRef.current.destroy();
    }

    const theme = EditorView.theme({
      "&": {
        height: "100%",
      },
      ".cm-scroller": {
        fontFamily: "var(--font-mono)",
      },
    });

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        setBody(update.state.doc.toString());
      }
    });

    const state = EditorState.create({
      doc: noteContent.body,
      extensions: [
        vimCompartment.current.of(vimMode ? vim({ status: true }) : []),
        theme,
        markdown(),
        syntaxHighlighting(markdownHighlight),
        clickableLinks,
        history(),
        keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
        placeholder("Start writing..."),
        updateListener,
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      if (!isCreating) {
        flush();
      }
      view.destroy();
    };
  }, [selectedPath, vimMode]);

  function handleTitleChange(newTitle: string) {
    setTitle(newTitle);
  }

  function handleTitleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      viewRef.current?.focus();
    }
  }

  if (!noteContent) return null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-hidden" style={{ paddingTop: 52 }}>
        <div className="h-full overflow-y-auto">
          <div className="px-6 pt-6">
            <input
              ref={titleInputRef}
              type="text"
              value={noteContent.title}
              onChange={(e) => handleTitleChange(e.target.value)}
              onKeyDown={handleTitleKeyDown}
              placeholder="New Page"
              className="editor-title"
            />
          </div>
          <div ref={containerRef} className="px-6 pb-6" />
        </div>
      </div>
    </div>
  );
}

export { buildContent, parseContent } from "../stores/notes-store";
