/**
 * Handing the player a file.
 *
 * The browser's own answer is a detached anchor carrying a `download`
 * attribute, and that is what runs when Verdance is served as an ordinary page.
 *
 * Not every host allows it. A page inside a hardened sandbox can be denied
 * downloads entirely, and there the anchor does not fail — it silently does
 * nothing, which is the worst way for an Export button to behave. So a host may
 * install a bridge and take the file itself. The single-file build produced by
 * `tools/standalone.ts` ships one; nothing in the game knows or cares which
 * host it is running on.
 */

export type SaveFile = (filename: string, blob: Blob) => void | Promise<void>;

declare global {
  interface Window {
    /** Installed by an embedding host that will not let the anchor work. */
    __verdanceSaveFile?: SaveFile;
  }
}

export function saveFile(filename: string, blob: Blob): void {
  const bridge = typeof window === "undefined" ? undefined : window.__verdanceSaveFile;
  if (bridge) {
    void bridge(filename, blob);
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
