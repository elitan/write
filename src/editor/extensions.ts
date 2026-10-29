import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import {
  highlightSelectionMatches,
  search,
  searchKeymap,
} from "@codemirror/search";
import { Compartment, type Extension, Prec } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  type KeyBinding,
  keymap,
  placeholder,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { getApi } from "../lib/api";
import { blockHandles } from "./block-handles";
import { moveBlockDown, moveBlockUp } from "./blocks";
import { autoTask, pasteLink, toggleTask, toggleWrap } from "./commands";
import { livePreview, urlAt } from "./live-preview";

export interface EditorConfig {
  vimMode: boolean;
  spellcheck: boolean;
  hideMarkdown: boolean;
}

export interface EditorHooks {
  onChange: () => void;
  /** Caret tried to move above the first line: hand focus to the title. */
  onExitTop: () => boolean;
}

const highlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: "650", color: "var(--fg)" },
  { tag: tags.strong, fontWeight: "650" },
  { tag: tags.emphasis, fontStyle: "italic" },
  {
    tag: tags.strikethrough,
    textDecoration: "line-through",
    color: "var(--fg-muted)",
  },
  { tag: tags.monospace, fontFamily: "var(--font-mono)", fontSize: "0.88em" },
  { tag: tags.link, color: "var(--accent-text)" },
  { tag: tags.url, textDecoration: "none" },
  { tag: tags.quote, color: "var(--fg-muted)" },
  { tag: [tags.processingInstruction, tags.meta], color: "var(--fg-faint)" },
  { tag: tags.contentSeparator, color: "var(--fg-faint)" },
  // Fenced code tokens.
  {
    tag: [tags.keyword, tags.modifier, tags.operatorKeyword],
    color: "var(--syntax-keyword)",
  },
  {
    tag: [tags.string, tags.special(tags.string), tags.regexp],
    color: "var(--syntax-string)",
  },
  {
    tag: [tags.number, tags.bool, tags.null, tags.atom],
    color: "var(--syntax-number)",
  },
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment],
    color: "var(--fg-subtle)",
    fontStyle: "italic",
  },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
    color: "var(--syntax-function)",
  },
  {
    tag: [tags.typeName, tags.className, tags.tagName],
    color: "var(--syntax-type)",
  },
  {
    tag: [tags.propertyName, tags.attributeName],
    color: "var(--syntax-property)",
  },
]);

const vimCompartment = new Compartment();
const spellCompartment = new Compartment();
const previewCompartment = new Compartment();

async function vimExtension(): Promise<Extension> {
  const { vim } = await import("@replit/codemirror-vim");
  return vim({ status: true });
}

let vimCache: Extension | null = null;

/** Vim is loaded on demand so everyone else never pays for it. */
export async function loadVim() {
  vimCache ??= await vimExtension();
  return vimCache;
}

function spellAttrs(on: boolean) {
  return EditorView.contentAttributes.of({
    spellcheck: on ? "true" : "false",
    autocorrect: on ? "on" : "off",
    autocapitalize: on ? "sentences" : "off",
  });
}

export function reconfigure(config: EditorConfig) {
  return [
    vimCompartment.reconfigure(config.vimMode && vimCache ? vimCache : []),
    spellCompartment.reconfigure(spellAttrs(config.spellcheck)),
    previewCompartment.reconfigure(livePreview(config.hideMarkdown)),
  ];
}

const openLinks = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (!(event.metaKey || event.ctrlKey) || event.button !== 0) return false;
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos === null) return false;
    const url = urlAt(view.state, pos);
    if (!url) return false;
    event.preventDefault();
    getApi().openUrl(url);
    return true;
  },
  paste: pasteLink,
});

export function createExtensions(
  config: EditorConfig,
  hooks: EditorHooks,
): Extension {
  const formatting: KeyBinding[] = [
    { key: "Mod-b", run: toggleWrap("**") },
    { key: "Mod-i", run: toggleWrap("*") },
    { key: "Mod-e", run: toggleWrap("`") },
    { key: "Mod-Shift-x", run: toggleWrap("~~") },
    { key: "Mod-Enter", run: toggleTask },
    { key: "Mod-Shift-ArrowUp", run: moveBlockUp },
    { key: "Mod-Shift-ArrowDown", run: moveBlockDown },
    {
      key: "ArrowUp",
      run: (view) => {
        const { main } = view.state.selection;
        if (!main.empty || view.state.doc.lineAt(main.head).number !== 1)
          return false;
        // Only when on the first visual line of a wrapped paragraph.
        const coords = view.coordsAtPos(main.head);
        const top = view.coordsAtPos(0);
        if (coords && top && coords.top > top.top + 2) return false;
        return hooks.onExitTop();
      },
    },
    {
      key: "Backspace",
      run: (view) => {
        const { main } = view.state.selection;
        return main.empty && main.head === 0 ? hooks.onExitTop() : false;
      },
    },
  ];

  return [
    vimCompartment.of(config.vimMode && vimCache ? vimCache : []),
    Prec.high(keymap.of(formatting)),
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    syntaxHighlighting(highlight),
    previewCompartment.of(livePreview(config.hideMarkdown)),
    spellCompartment.of(spellAttrs(config.spellcheck)),
    history(),
    drawSelection(),
    indentOnInput(),
    search({ top: true }),
    highlightSelectionMatches({ minSelectionLength: 2 }),
    keymap.of([
      indentWithTab,
      ...searchKeymap,
      ...defaultKeymap,
      ...historyKeymap,
    ]),
    placeholder("Write something…"),
    openLinks,
    autoTask,
    blockHandles,
    EditorView.lineWrapping,
    EditorView.updateListener.of((u) => {
      if (u.docChanged) hooks.onChange();
    }),
  ];
}
