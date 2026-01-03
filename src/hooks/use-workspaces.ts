import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface Workspace {
  id: string;
  name: string;
  shortcut: string | null;
}

interface WorkspaceConfig {
  workspaces: Workspace[];
  active_workspace_id: string;
}

export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadWorkspaces = useCallback(async () => {
    try {
      const config = await invoke<WorkspaceConfig>("get_workspaces");
      setWorkspaces(config.workspaces);
      setActiveWorkspaceId(config.active_workspace_id);
    } catch (err) {
      console.error("Failed to load workspaces:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) || null;

  async function switchWorkspace(workspaceId: string) {
    try {
      await invoke("set_active_workspace", { workspaceId });
      setActiveWorkspaceId(workspaceId);
    } catch (err) {
      console.error("Failed to switch workspace:", err);
      throw err;
    }
  }

  async function createWorkspace(name: string) {
    try {
      const workspace = await invoke<Workspace>("create_workspace", { name });
      setWorkspaces((prev) => [...prev, workspace]);
      return workspace;
    } catch (err) {
      console.error("Failed to create workspace:", err);
      throw err;
    }
  }

  async function deleteWorkspace(workspaceId: string) {
    try {
      await invoke("delete_workspace", { workspaceId });
      setWorkspaces((prev) => prev.filter((w) => w.id !== workspaceId));
      if (activeWorkspaceId === workspaceId) {
        const remaining = workspaces.filter((w) => w.id !== workspaceId);
        if (remaining.length > 0) {
          setActiveWorkspaceId(remaining[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to delete workspace:", err);
      throw err;
    }
  }

  async function renameWorkspace(workspaceId: string, newName: string) {
    try {
      const updated = await invoke<Workspace>("rename_workspace", { workspaceId, newName });
      setWorkspaces((prev) => prev.map((w) => (w.id === workspaceId ? updated : w)));
      return updated;
    } catch (err) {
      console.error("Failed to rename workspace:", err);
      throw err;
    }
  }

  return {
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    isLoading,
    switchWorkspace,
    createWorkspace,
    deleteWorkspace,
    renameWorkspace,
    reload: loadWorkspaces,
  };
}
