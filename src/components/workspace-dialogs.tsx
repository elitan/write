import { useState } from "react";
import * as actions from "../store/actions";
import { useNotes } from "../store/notes";
import { closeDialog, errorMessage, useUi } from "../store/ui";
import { Button, TextInput } from "./ui/controls";
import { Dialog } from "./ui/dialog";

function NameDialog({
  title,
  description,
  initial,
  submitLabel,
  onSubmit,
}: {
  title: string;
  description: string;
  initial: string;
  submitLabel: string;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await onSubmit(name.trim());
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Dialog onClose={closeDialog} label={title} className="max-w-[400px]">
      <form onSubmit={submit} className="p-5">
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 mb-4 text-[13px] text-fg-subtle">{description}</p>
        <TextInput
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          onFocus={(e) => e.currentTarget.select()}
          placeholder="Workspace name"
          aria-invalid={!!error}
        />
        <div className="mt-1.5 h-4 text-[12px] text-danger">{error}</div>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" onClick={closeDialog}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={!name.trim() || busy}
          >
            {submitLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function WorkspaceDialogs() {
  const dialog = useUi((s) => s.dialog);
  const workspaces = useNotes((s) => s.workspaces);
  const [busy, setBusy] = useState(false);

  if (dialog?.type === "workspace-create") {
    return (
      <NameDialog
        title="New workspace"
        description="A separate folder of notes in ~/Documents/Notes."
        initial=""
        submitLabel="Create workspace"
        onSubmit={actions.createWorkspace}
      />
    );
  }

  if (dialog?.type === "workspace-rename") {
    const ws = workspaces.find((w) => w.id === dialog.workspaceId);
    return (
      <NameDialog
        title="Rename workspace"
        description="Only the display name changes. The folder stays the same."
        initial={ws?.name ?? ""}
        submitLabel="Rename"
        onSubmit={(name) => actions.renameWorkspace(dialog.workspaceId, name)}
      />
    );
  }

  if (dialog?.type === "workspace-delete") {
    const ws = workspaces.find((w) => w.id === dialog.workspaceId);
    return (
      <Dialog
        onClose={closeDialog}
        label="Remove workspace"
        className="max-w-[400px]"
      >
        <div className="p-5">
          <h2 className="text-[15px] font-semibold tracking-tight">
            Remove “{ws?.name}”?
          </h2>
          <p className="mt-1.5 text-[13px] text-fg-subtle">
            The workspace leaves Write, but its notes stay on disk in{" "}
            <code className="font-mono text-[12px] text-fg-muted">
              ~/Documents/Notes/{ws?.id}
            </code>
            .
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              variant="danger"
              autoFocus
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await actions.deleteWorkspace(dialog.workspaceId);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Remove workspace
            </Button>
          </div>
        </div>
      </Dialog>
    );
  }

  return null;
}
