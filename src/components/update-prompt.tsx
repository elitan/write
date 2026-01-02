import { RefreshCw } from "lucide-react";

interface UpdatePromptProps {
  version: string;
  onRestart: () => void;
}

export function UpdatePrompt({ version, onRestart }: UpdatePromptProps) {
  return (
    <div className="fixed bottom-4 right-4 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 shadow-lg flex items-center gap-3 z-50">
      <RefreshCw className="w-4 h-4 text-blue-400" />
      <span className="text-sm text-zinc-200">
        Update {version} ready
      </span>
      <button
        onClick={onRestart}
        className="text-sm text-blue-400 hover:text-blue-300 font-medium"
      >
        Restart now
      </button>
    </div>
  );
}
