import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { debugLog } from "./debug-panel";
import { EditorState, Compartment } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { vim, Vim } from "@replit/codemirror-vim";
import { invoke } from "@tauri-apps/api/core";

interface EditorProps {
  content: string;
  filePath: string;
  isCreating: boolean;
  isSaving: boolean;
  vimMode: boolean;
  onSaved: () => void;
  onPathChanged: (oldPath: string, newPath: string) => void;
  onTitleChange: (path: string, title: string) => void;
  onClose: () => void;
}

function parseContent(content: string): { title: string; body: string } {
  const lines = content.split("\n");
  const titleLineIndex = lines.findIndex((line) => line.startsWith("# "));

  if (titleLineIndex === -1) {
    return { title: "", body: content };
  }

  const title = lines[titleLineIndex].slice(2);
  const body = [
    ...lines.slice(0, titleLineIndex),
    ...lines.slice(titleLineIndex + 1),
  ].join("\n");

  return { title, body };
}

function buildContent(title: string, body: string): string {
  return `# ${title}\n${body}`;
}

export function Editor({ content, filePath, isCreating, isSaving, vimMode, onSaved, onPathChanged, onTitleChange, onClose }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<number | null>(null);
  const lastSavedRef = useRef(content);
  const isSavingRef = useRef(false);
  const vimCompartment = useRef(new Compartment());

  const parsed = useMemo(() => parseContent(content), [content]);
  const [title, setTitle] = useState(parsed.title);
  const filePathRef = useRef(filePath);
  const isCreatingRef = useRef(isCreating);

  const titleStateRef = useRef(title);
  useEffect(() => {
    titleStateRef.current = title;
  }, [title]);

  useEffect(() => {
    filePathRef.current = filePath;
  }, [filePath]);

  const saveNow = useCallback(
    async (text: string, path: string) => {
      if (text === lastSavedRef.current || isSavingRef.current) return;
      isSavingRef.current = true;
      try {
        debugLog("editor:save", { path, contentLength: text.length });
        const newPath = await invoke<string>("write_note", { path, content: text });
        lastSavedRef.current = text;
        if (newPath !== path) {
          onPathChanged(path, newPath);
        }
        onSaved();
      } catch (err) {
        console.error("Failed to save:", err);
      } finally {
        isSavingRef.current = false;
      }
    },
    [onSaved, onPathChanged]
  );

  const debouncedSave = useCallback(
    (text: string, path: string) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = window.setTimeout(() => {
        saveNow(text, path);
      }, 300);
    },
    [saveNow]
  );

  useEffect(() => {
    const wasCreating = isCreatingRef.current;
    debugLog("editor:isCreatingEffect", {
      wasCreating,
      isCreating,
      filePath,
      hasView: !!viewRef.current,
      titleState: titleStateRef.current,
    });
    isCreatingRef.current = isCreating;
    if (wasCreating && !isCreating && viewRef.current) {
      const body = viewRef.current.state.doc.toString();
      const fullContent = buildContent(titleStateRef.current, body);
      debugLog("editor:creationComplete", { filePath, title: titleStateRef.current, bodyLength: body.length });
      debouncedSave(fullContent, filePath);
    }
  }, [isCreating, filePath, debouncedSave]);

  useEffect(() => {
    const newParsed = parseContent(content);
    debugLog("editor:syncTitle", {
      filePath,
      contentLength: content.length,
      parsedTitle: newParsed.title,
    });
    setTitle(newParsed.title);
    setTimeout(() => {
      if (!newParsed.title) {
        titleInputRef.current?.focus();
      } else {
        viewRef.current?.focus();
      }
    }, 0);
  }, [content]);

  useEffect(() => {
    if (!vimMode) return;
    Vim.defineEx("q", "q", onClose);
    Vim.defineEx("wq", "wq", onClose);
  }, [vimMode, onClose]);

  function handleTitleChange(newTitle: string) {
    debugLog("editor:titleChange", { newTitle, isCreating: isCreatingRef.current, filePath: filePathRef.current });
    setTitle(newTitle);
    onTitleChange(filePathRef.current, newTitle);
    if (isCreatingRef.current) {
      debugLog("editor:titleChange:skipSave", { reason: "isCreating" });
      return;
    }
    const body = viewRef.current?.state.doc.toString() ?? "";
    const fullContent = buildContent(newTitle, body);
    debouncedSave(fullContent, filePathRef.current);
  }

  function handleTitleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      viewRef.current?.focus();
    }
  }

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

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && !isCreatingRef.current) {
        const body = update.state.doc.toString();
        const fullContent = buildContent(titleStateRef.current, body);
        debouncedSave(fullContent, filePathRef.current);
      }
    });

    const state = EditorState.create({
      doc: parsed.body,
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
    lastSavedRef.current = content;

    return () => {
      debugLog("editor:cleanup", {
        isCreating: isCreatingRef.current,
        filePath: filePathRef.current,
        title: titleStateRef.current,
      });
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (!isCreatingRef.current) {
        const body = view.state.doc.toString();
        const fullContent = buildContent(titleStateRef.current, body);
        debugLog("editor:cleanup:save", {
          willSave: fullContent !== lastSavedRef.current,
          contentLength: fullContent.length,
          lastSavedLength: lastSavedRef.current.length,
        });
        if (fullContent !== lastSavedRef.current) {
          invoke("write_note", { path: filePathRef.current, content: fullContent });
        }
      }
      view.destroy();
    };
  }, [content, vimMode]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-hidden" style={{ paddingTop: 52 }}>
        <div className="h-full overflow-y-auto">
          <div className="px-6 pt-6">
            <input
              ref={titleInputRef}
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              onKeyDown={handleTitleKeyDown}
              placeholder="New Page"
              className="editor-title"
            />
          </div>
          <div ref={containerRef} className="px-6 pb-6" />
        </div>
      </div>
      {isSaving && (
        <div className="absolute bottom-4 right-4 px-2 py-1 text-xs text-[var(--color-muted)] bg-[var(--color-sidebar)] rounded-[var(--radius-sm)] border border-[var(--color-border)]">
          Saving...
        </div>
      )}
    </div>
  );
}
