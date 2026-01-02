import { useEffect, useRef, useCallback } from "react";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { invoke } from "@tauri-apps/api/core";

interface EditorProps {
  content: string;
  filePath: string;
  isSaving: boolean;
  onSaved: () => void;
}

export function Editor({ content, filePath, isSaving, onSaved }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const saveTimeoutRef = useRef<number | null>(null);
  const lastSavedRef = useRef(content);
  const isSavingRef = useRef(false);

  const saveNow = useCallback(
    async (text: string, path: string) => {
      if (text === lastSavedRef.current || isSavingRef.current) return;
      isSavingRef.current = true;
      try {
        await invoke("write_note", { path, content: text });
        lastSavedRef.current = text;
        onSaved();
      } catch (err) {
        console.error("Failed to save:", err);
      } finally {
        isSavingRef.current = false;
      }
    },
    [onSaved]
  );

  const debouncedSave = useCallback(
    (text: string, path: string) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = window.setTimeout(() => {
        saveNow(text, path);
      }, 800);
    },
    [saveNow]
  );

  useEffect(() => {
    if (!containerRef.current) return;

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

    const currentPath = filePath;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const text = update.state.doc.toString();
        debouncedSave(text, currentPath);
      }
    });

    const state = EditorState.create({
      doc: content,
      extensions: [
        theme,
        markdown(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
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
    lastSavedRef.current = content;

    setTimeout(() => view.focus(), 0);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      const currentContent = view.state.doc.toString();
      if (currentContent !== lastSavedRef.current) {
        invoke("write_note", { path: currentPath, content: currentContent });
      }
      view.destroy();
    };
  }, [filePath, content]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-hidden" style={{ paddingTop: 52 }}>
        <div ref={containerRef} className="h-full p-6" />
      </div>
      {isSaving && (
        <div className="absolute bottom-4 right-4 px-2 py-1 text-xs text-[var(--color-muted)] bg-[var(--color-sidebar)] rounded-[var(--radius-sm)] border border-[var(--color-border)]">
          Saving...
        </div>
      )}
    </div>
  );
}
