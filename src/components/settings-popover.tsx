import { Modal } from "./modal";

interface SettingsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  vimMode: boolean;
  onVimModeChange: (enabled: boolean) => void;
}

export function SettingsPopover({
  isOpen,
  onClose,
  vimMode,
  onVimModeChange,
}: SettingsPopoverProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Settings">
      <label className="flex items-center justify-between cursor-pointer">
        <span className="text-sm">Vim mode</span>
        <button
          onClick={() => onVimModeChange(!vimMode)}
          className={`relative w-10 h-6 rounded-full transition-colors ${
            vimMode ? "bg-[var(--color-accent)]" : "bg-[var(--color-border)]"
          }`}
        >
          <span
            className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
              vimMode ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
      </label>
    </Modal>
  );
}
