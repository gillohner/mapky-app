/**
 * Thin wrappers around the Origin Private File System (OPFS).
 *
 * OPFS gives us a private, browser-managed filesystem rooted at
 * `navigator.storage.getDirectory()`. It supports arbitrary sizes
 * (subject to quota), random access via streams + `FileSystemSyncAccessHandle`,
 * and survives reloads. We use it for the PMTiles archives that back
 * downloaded regions — IndexedDB blob storage would work too but
 * regional pmtiles can be hundreds of MB and OPFS handles streamed
 * writes more efficiently.
 *
 * All helpers normalize the path (leading slash stripped) and walk
 * subdirectories on demand.
 */

function normalize(path: string): string[] {
  return path.replace(/^\/+/, "").split("/").filter(Boolean);
}

async function ensureDirChain(
  root: FileSystemDirectoryHandle,
  segments: string[],
  create: boolean,
): Promise<FileSystemDirectoryHandle> {
  let cur = root;
  for (const seg of segments) {
    cur = await cur.getDirectoryHandle(seg, { create });
  }
  return cur;
}

export async function opfsRoot(): Promise<FileSystemDirectoryHandle> {
  if (!("storage" in navigator) || !navigator.storage.getDirectory) {
    throw new Error("OPFS not supported in this browser");
  }
  return navigator.storage.getDirectory();
}

/**
 * Stream `data` to OPFS at `path`. Existing files are overwritten.
 * `data` can be a stream (preferred for large downloads) or a fixed
 * buffer; we tee streams so the caller can read while we write.
 */
export async function writeFile(
  path: string,
  data: ReadableStream<Uint8Array> | Blob | ArrayBuffer | Uint8Array,
): Promise<void> {
  const root = await opfsRoot();
  const segs = normalize(path);
  if (segs.length === 0) throw new Error("Empty path");
  const fileName = segs.pop()!;
  const dir = await ensureDirChain(root, segs, true);
  const handle = await dir.getFileHandle(fileName, { create: true });
  const writable = await handle.createWritable();
  try {
    if (data instanceof ReadableStream) {
      await data.pipeTo(writable);
      return;
    }
    if (data instanceof Blob) {
      await writable.write(data);
    } else if (data instanceof ArrayBuffer) {
      await writable.write(data);
    } else {
      // Copy into a fresh ArrayBuffer-backed Uint8Array. TS 5.x
      // narrows generic Uint8Arrays to `ArrayBufferLike`, which the
      // OPFS writer's BlobPart type rejects (it wants ArrayBuffer
      // specifically, not SharedArrayBuffer).
      const buf = new ArrayBuffer(data.byteLength);
      new Uint8Array(buf).set(data);
      await writable.write(buf);
    }
    await writable.close();
  } catch (err) {
    try {
      await writable.abort();
    } catch {
      /* ignore */
    }
    throw err;
  }
}

export async function readFile(path: string): Promise<File> {
  const root = await opfsRoot();
  const segs = normalize(path);
  if (segs.length === 0) throw new Error("Empty path");
  const fileName = segs.pop()!;
  const dir = await ensureDirChain(root, segs, false);
  const handle = await dir.getFileHandle(fileName, { create: false });
  return handle.getFile();
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

export async function deleteFile(path: string): Promise<void> {
  const root = await opfsRoot();
  const segs = normalize(path);
  if (segs.length === 0) throw new Error("Empty path");
  const fileName = segs.pop()!;
  const dir = await ensureDirChain(root, segs, false);
  await dir.removeEntry(fileName);
}

export async function fileSize(path: string): Promise<number> {
  const file = await readFile(path);
  return file.size;
}

/**
 * Walk the entire OPFS tree and return the total byte size. Useful
 * for the storage summary page in Phase 6. Not a hot path.
 */
export async function totalSize(): Promise<number> {
  const root = await opfsRoot();
  return walkSize(root);
}

async function walkSize(dir: FileSystemDirectoryHandle): Promise<number> {
  let total = 0;
  // @ts-expect-error — `values()` is async iterable on FileSystemDirectoryHandle
  for await (const entry of dir.values()) {
    if (entry.kind === "file") {
      const file = await (entry as FileSystemFileHandle).getFile();
      total += file.size;
    } else if (entry.kind === "directory") {
      total += await walkSize(entry as FileSystemDirectoryHandle);
    }
  }
  return total;
}
