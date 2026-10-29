import { create } from "zustand";

export type Theme = "system" | "light" | "dark";
export type EditorFont = "sans" | "serif" | "mono";
export type EditorWidth = "narrow" | "medium" | "wide";

export interface Settings {
  theme: Theme;
  editorFont: EditorFont;
  editorWidth: EditorWidth;
  /** Document text size in px; ⌘+ / ⌘− / ⌘0. */
  textSize: number;
  vimMode: boolean;
  spellcheck: boolean;
  hideMarkdown: boolean;
  sidebarOpen: boolean;
  sidebarWidth: number;
}

// Same key as v1 so an existing vim-mode preference carries over.
const STORAGE_KEY = "write-settings";

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  editorFont: "sans",
  editorWidth: "medium",
  textSize: 17,
  vimMode: false,
  spellcheck: false,
  hideMarkdown: true,
  sidebarOpen: true,
  sidebarWidth: 260,
};

export const TEXT_SIZE_MIN = 12;
export const TEXT_SIZE_MAX = 32;

export const SIDEBAR_MIN = 200;
export const SIDEBAR_MAX = 420;

function load(): Settings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored
      ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) }
      : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export const useSettings = create<Settings>(load);

useSettings.subscribe((settings) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private mode or quota: settings just won't persist.
  }
});

export function setSetting<K extends keyof Settings>(
  key: K,
  value: Settings[K],
) {
  useSettings.setState({ [key]: value } as Pick<Settings, K>);
}

export function toggleSetting(
  key: "vimMode" | "spellcheck" | "hideMarkdown" | "sidebarOpen",
) {
  setSetting(key, !useSettings.getState()[key]);
}

/** Steps the document text size by `delta` px (0 resets); returns the new size. */
export function stepTextSize(delta: number) {
  const current = useSettings.getState().textSize;
  const next =
    delta === 0
      ? DEFAULT_SETTINGS.textSize
      : Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, current + delta));
  setSetting("textSize", next);
  return next;
}

// Module-level state can't be hot-swapped; reload instead of splitting it.
import.meta.hot?.accept(() => location.reload());
