import { useEffect, useState } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export function useUpdater() {
  const [updateAvailable, setUpdateAvailable] = useState<Update | null>(null);
  const [readyToInstall, setReadyToInstall] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  async function checkAndDownload() {
    try {
      console.log("[updater] checking for updates...");
      const update = await check();

      if (!update) {
        console.log("[updater] no update available");
        return;
      }

      console.log("[updater] update available:", update.version);
      setUpdateAvailable(update);
      setIsDownloading(true);

      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          console.log("[updater] download started");
        } else if (event.event === "Progress") {
          console.log("[updater] downloading...", event.data.chunkLength);
        } else if (event.event === "Finished") {
          console.log("[updater] download finished, ready to install");
          setIsDownloading(false);
          setReadyToInstall(true);
        }
      });
    } catch (error) {
      console.error("[updater] error:", error);
      setIsDownloading(false);
    }
  }

  async function restartAndInstall() {
    console.log("[updater] restarting to apply update");
    await relaunch();
  }

  useEffect(() => {
    checkAndDownload();

    const interval = setInterval(checkAndDownload, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return {
    updateAvailable,
    readyToInstall,
    isDownloading,
    restartAndInstall,
  };
}
