/**
 * Save persistence: versioned JSON in IndexedDB, with export and import to file
 * (§10).
 *
 * IndexedDB rather than localStorage because a ranch of five hundred creatures
 * is megabytes, and because localStorage is synchronous and would stutter the
 * frame it writes on. Every call is wrapped: a browser with storage blocked
 * must still be playable for the session, just not resumable.
 */

import { fromJson, suggestedFilename, toJson } from "@chimaera/game";
import type { RanchState } from "@chimaera/game";

const DB_NAME = "chimaera";
const DB_VERSION = 1;
const STORE = "ranches";
export const AUTOSAVE_SLOT = "autosave";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("could not open the save database"));
  });
}

export async function saveToSlot(slot: string, state: RanchState): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(toJson(state), slot);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("could not write the save"));
  });
  db.close();
}

export async function loadFromSlot(slot: string): Promise<RanchState | undefined> {
  const db = await openDb();
  const json = await new Promise<unknown>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(slot);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("could not read the save"));
  });
  db.close();
  return typeof json === "string" ? fromJson(json) : undefined;
}

export async function listSlots(): Promise<string[]> {
  const db = await openDb();
  const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).getAllKeys();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("could not list saves"));
  });
  db.close();
  return keys.map(String);
}

/** Download the ranch as a file the player can keep, move and re-import. */
export function exportToFile(state: RanchState): void {
  const blob = new Blob([toJson(state)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = suggestedFilename(state);
  link.click();
  URL.revokeObjectURL(url);
}

export async function importFromFile(file: File): Promise<RanchState> {
  return fromJson(await file.text());
}
