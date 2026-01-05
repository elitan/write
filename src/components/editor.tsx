import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { Vim, vim } from "@replit/codemirror-vim";
import { useEffect, useRef } from "react";
import { useNotesStore } from "../stores/notes-store";

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
