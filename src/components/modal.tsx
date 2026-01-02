import { useEffect } from "react";
import { X } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100]" onClick={onClose}>
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        style={{ animation: "modalFadeIn 100ms ease" }}
      />
      <div className="fixed inset-0 flex items-center justify-center">
        <div
          className="w-80 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
          style={{ animation: "modalSlideIn 100ms ease" }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
            <span className="text-sm font-medium">{title}</span>
            <button
              onClick={onClose}
              className="p-1 hover:bg-[var(--color-sidebar)] rounded-[var(--radius-sm)] transition-colors"
            >
              <X size={14} className="text-[var(--color-muted)]" />
            </button>
          </div>
          <div className="p-4">{children}</div>
        </div>
      </div>

      <style>{`
        @keyframes modalFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modalSlideIn {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
