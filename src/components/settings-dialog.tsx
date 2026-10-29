import {
  Info,
  Keyboard,
  Minus,
  Monitor,
  Moon,
  Plus,
  Settings2,
  Sun,
  Type,
} from "lucide-react";
import { commands } from "../commands";
import { checkForUpdates, useUpdater } from "../hooks/use-updater";
import { isTauri, modKey } from "../lib/platform";
import {
  type EditorFont,
  type EditorWidth,
  setSetting,
  stepTextSize,
  TEXT_SIZE_MAX,
  TEXT_SIZE_MIN,
  type Theme,
  useSettings,
} from "../store/settings";
import { closeDialog, type SettingsTab, useUi } from "../store/ui";
import { Button, Segmented, Switch } from "./ui/controls";
import { Dialog } from "./ui/dialog";
import { Shortcut } from "./ui/kbd";

const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: "general", label: "General", icon: <Settings2 size={14} /> },
  { id: "editor", label: "Editor", icon: <Type size={14} /> },
  { id: "shortcuts", label: "Shortcuts", icon: <Keyboard size={14} /> },
  { id: "about", label: "About", icon: <Info size={14} /> },
];

function Row({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 border-line border-b py-3.5 last:border-b-0">
      <div className="min-w-0">
        <div className="text-[13px] text-fg">{title}</div>
        {description && (
          <div className="mt-0.5 text-[12px] text-fg-subtle">{description}</div>
        )}
      </div>
      {children}
    </div>
  );
}

function General() {
  const theme = useSettings((s) => s.theme);
  return (
    <>
      <Row title="Theme" description="Follow macOS or pick one.">
        <Segmented<Theme>
          label="Theme"
          value={theme}
          onChange={(v) => setSetting("theme", v)}
          options={[
            { value: "system", label: "System", icon: <Monitor size={12} /> },
            { value: "light", label: "Light", icon: <Sun size={12} /> },
            { value: "dark", label: "Dark", icon: <Moon size={12} /> },
          ]}
        />
      </Row>
      <Row
        title="Notes folder"
        description="Plain markdown files you can open with any app."
      >
        <code className="rounded-md bg-hover px-2 py-1 font-mono text-[11px] text-fg-muted">
          ~/Documents/Notes
        </code>
      </Row>
    </>
  );
}

function EditorSettings() {
  const s = useSettings();
  return (
    <>
      <Row title="Font">
        <Segmented<EditorFont>
          label="Font"
          value={s.editorFont}
          onChange={(v) => setSetting("editorFont", v)}
          options={[
            { value: "sans", label: "Sans" },
            { value: "serif", label: "Serif" },
            { value: "mono", label: "Mono" },
          ]}
        />
      </Row>
      <Row
        title="Text size"
        description={`${modKey}+ and ${modKey}− work anywhere, ${modKey}0 resets.`}
      >
        <TextSizeStepper />
      </Row>
      <Row title="Line width">
        <Segmented<EditorWidth>
          label="Line width"
          value={s.editorWidth}
          onChange={(v) => setSetting("editorWidth", v)}
          options={[
            { value: "narrow", label: "Narrow" },
            { value: "medium", label: "Medium" },
            { value: "wide", label: "Wide" },
          ]}
        />
      </Row>
      <Row
        title="Hide markdown syntax"
        description="Show formatting, reveal the raw markdown where the cursor is."
      >
        <Switch
          label="Hide markdown syntax"
          checked={s.hideMarkdown}
          onChange={(v) => setSetting("hideMarkdown", v)}
        />
      </Row>
      <Row title="Spellcheck">
        <Switch
          label="Spellcheck"
          checked={s.spellcheck}
          onChange={(v) => setSetting("spellcheck", v)}
        />
      </Row>
      <Row
        title="Vim mode"
        description="Modal editing. :q focuses the note list."
      >
        <Switch
          label="Vim mode"
          checked={s.vimMode}
          onChange={(v) => setSetting("vimMode", v)}
        />
      </Row>
    </>
  );
}

function TextSizeStepper() {
  const size = useSettings((s) => s.textSize);
  const step =
    "inline-flex size-6 items-center justify-center rounded-md text-fg-subtle transition-colors duration-100 hover:bg-surface hover:text-fg disabled:pointer-events-none disabled:opacity-40";
  return (
    <div className="inline-flex shrink-0 items-center rounded-lg bg-hover p-0.5">
      <button
        type="button"
        aria-label="Smaller text"
        className={step}
        disabled={size <= TEXT_SIZE_MIN}
        onClick={() => stepTextSize(-1)}
      >
        <Minus size={13} />
      </button>
      <button
        type="button"
        title="Reset to default"
        className="h-6 min-w-12 rounded-md px-1 text-[12px] font-medium tabular-nums text-fg hover:bg-surface"
        onClick={() => stepTextSize(0)}
      >
        {size}px
      </button>
      <button
        type="button"
        aria-label="Larger text"
        className={step}
        disabled={size >= TEXT_SIZE_MAX}
        onClick={() => stepTextSize(1)}
      >
        <Plus size={13} />
      </button>
    </div>
  );
}

const editorShortcuts: [string, string][] = [
  ["Bold", "mod+b"],
  ["Italic", "mod+i"],
  ["Inline code", "mod+e"],
  ["Strikethrough", "mod+shift+x"],
  ["Toggle task", "mod+enter"],
  ["Move block up", "mod+shift+up"],
  ["Move block down", "mod+shift+down"],
  ["Indent list", "tab"],
  ["Find", "mod+f"],
];

function Shortcuts() {
  const groups = ["Note", "Navigate", "Workspace", "Preferences"] as const;
  const section = (title: string, rows: [string, string][]) => (
    <div key={title} className="mb-5">
      <div className="mb-1 text-[11px] font-medium text-fg-subtle">{title}</div>
      {rows.map(([label, keys]) => (
        <div
          key={label}
          className="flex h-8 items-center justify-between text-[13px] text-fg-muted"
        >
          {label}
          <Shortcut keys={keys} />
        </div>
      ))}
    </div>
  );
  return (
    <div className="py-3">
      {groups.map((g) =>
        section(
          g,
          commands
            .filter((c) => c.group === g && c.shortcut)
            .map((c) => [c.title.replace("…", ""), c.shortcut!]),
        ),
      )}
      {section("Editing", editorShortcuts)}
      {section("Note list", [
        ["Move", "j"],
        ["Open in editor", "enter"],
        ["Delete", "backspace"],
      ])}
    </div>
  );
}

function About() {
  const status = useUpdater((s) => s.status);
  return (
    <div className="flex flex-col items-start gap-4 py-5">
      <div>
        <div className="text-[15px] font-semibold tracking-tight">Write</div>
        <div className="mt-1 max-w-[340px] text-[12px] text-fg-subtle">
          A fast, minimal home for your markdown notes. Local files, no
          accounts, no lock-in.
        </div>
      </div>
      {isTauri && (
        <Button
          size="sm"
          onClick={() => checkForUpdates(true)}
          disabled={status === "checking" || status === "downloading"}
        >
          {status === "checking"
            ? "Checking…"
            : status === "downloading"
              ? "Downloading…"
              : "Check for updates"}
        </Button>
      )}
    </div>
  );
}

export function SettingsDialog() {
  const tab = useUi((s) =>
    s.dialog?.type === "settings" ? s.dialog.tab : "general",
  );
  const setTab = (t: SettingsTab) =>
    useUi.setState({ dialog: { type: "settings", tab: t } });

  return (
    <Dialog
      onClose={closeDialog}
      label="Settings"
      className="flex h-[min(520px,80vh)] max-w-[680px]"
    >
      <nav className="flex w-[180px] shrink-0 flex-col gap-0.5 border-line border-r bg-sidebar p-2">
        <div className="px-2 pt-1.5 pb-2 text-[12px] font-medium text-fg-subtle">
          Settings
        </div>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex h-8 items-center gap-2 rounded-md px-2 text-[13px] transition-colors duration-75 ${
              tab === t.id
                ? "bg-active text-fg"
                : "text-fg-muted hover:bg-hover hover:text-fg"
            }`}
          >
            <span className="opacity-80">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="scroll flex-1 px-7 pt-5 pb-4">
        <h2 className="mb-2 text-[15px] font-semibold tracking-tight">
          {tabs.find((t) => t.id === tab)?.label}
        </h2>
        {tab === "general" && <General />}
        {tab === "editor" && <EditorSettings />}
        {tab === "shortcuts" && <Shortcuts />}
        {tab === "about" && <About />}
      </div>
    </Dialog>
  );
}
