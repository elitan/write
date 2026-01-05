import { useEffect, useRef, useState } from "react";

interface LogEntry {
  id: number;
  time: string;
  source: string;
  data: Record<string, unknown>;
}

let logId = 0;
const logListeners: ((entry: LogEntry) => void)[] = [];

export function debugLog(source: string, data: Record<string, unknown>) {
  const entry: LogEntry = {
    id: logId++,
    time: new Date().toISOString().slice(11, 23),
    source,
    data,
  };
  logListeners.forEach((fn) => fn(entry));
}

interface DebugPanelProps {
  state: Record<string, unknown>;
  isOpen: boolean;
  onClose: () => void;
}

export function DebugPanel({ state, isOpen, onClose }: DebugPanelProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [currentState, setCurrentState] = useState(state);
  const logsRef = useRef<HTMLDivElement>(null);
  const prevStateRef = useRef(state);

  useEffect(() => {
    const changed: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of Object.keys(state)) {
      if (prevStateRef.current[key] !== state[key]) {
        changed[key] = { from: prevStateRef.current[key], to: state[key] };
      }
    }
    if (Object.keys(changed).length > 0) {
      debugLog("state:change", changed);
    }
    prevStateRef.current = state;
    setCurrentState(state);
  }, [state]);

  useEffect(() => {
    function captureAllKeys(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      debugLog("key", {
        key: e.key,
        code: e.code,
        meta: e.metaKey,
        shift: e.shiftKey,
        ctrl: e.ctrlKey,
        alt: e.altKey,
        target: target.tagName,
        state: { ...prevStateRef.current },
      });
    }
    window.addEventListener("keydown", captureAllKeys, true);
    return () => window.removeEventListener("keydown", captureAllKeys, true);
  }, []);

  useEffect(() => {
    function addLog(entry: LogEntry) {
      setLogs((prev) => [...prev.slice(-10000), entry]);
    }
    logListeners.push(addLog);
    return () => {
      const idx = logListeners.indexOf(addLog);
      if (idx >= 0) logListeners.splice(idx, 1);
    };
  }, []);

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs]);

  function copyLogs() {
    const text = logs
      .map((l) => `[${l.time}] ${l.source}: ${JSON.stringify(l.data)}`)
      .join("\n");
    navigator.clipboard.writeText(text);
  }

  function clearLogs() {
    setLogs([]);
  }

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-4 right-4 w-[500px] h-[400px] bg-black/95 text-green-400 font-mono text-xs rounded-lg shadow-2xl z-[9999] flex flex-col overflow-hidden border border-green-800">
      <div className="flex items-center justify-between px-3 py-2 bg-green-900/30 border-b border-green-800">
        <span className="font-bold">Debug Panel (Cmd+Shift+D to toggle)</span>
        <div className="flex gap-2">
          <button
            onClick={clearLogs}
            className="px-2 py-0.5 bg-green-800 rounded hover:bg-green-700"
          >
            Clear
          </button>
          <button
            onClick={copyLogs}
            className="px-2 py-0.5 bg-green-800 rounded hover:bg-green-700"
          >
            Copy All
          </button>
          <button
            onClick={onClose}
            className="px-2 py-0.5 bg-red-800 rounded hover:bg-red-700"
          >
            Close
          </button>
        </div>
      </div>

      <div className="px-3 py-2 bg-green-900/20 border-b border-green-800">
        <div className="font-bold mb-1">State:</div>
        <div className="text-green-300">
          {Object.entries(currentState).map(([k, v]) => (
            <span key={k} className="mr-4">
              {k}=<span className="text-yellow-400">{JSON.stringify(v)}</span>
            </span>
          ))}
        </div>
      </div>

      <div ref={logsRef} className="flex-1 overflow-y-auto px-3 py-2">
        {logs.map((log) => (
          <div key={log.id} className="mb-1">
            <span className="text-gray-500">{log.time}</span>{" "}
            <span className="text-cyan-400">[{log.source}]</span>{" "}
            <span className="text-green-300">{JSON.stringify(log.data)}</span>
          </div>
        ))}
        {logs.length === 0 && (
          <div className="text-gray-500">Press keys to see events...</div>
        )}
      </div>
    </div>
  );
}
