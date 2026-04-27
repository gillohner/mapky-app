import {
  createGeoCapture,
  createGeoCaptureTag,
  createSequence,
} from "@/lib/mapky-specs";
import { uploadFile } from "@/lib/pubky/files";
import { ingestUserIntoNexus } from "@/lib/nexus/ingest";
import type { GeoCaptureKind } from "@/types/mapky";

interface PubkyStorage {
  putBytes(path: `/pub/${string}`, data: Uint8Array): Promise<void>;
  putText(path: `/pub/${string}`, text: string): Promise<void>;
}

interface PubkySession {
  storage: PubkyStorage;
}

export interface GeoCaptureDraft {
  file: File;
  kind: GeoCaptureKind;
  lat: number;
  lon: number;
  ele?: number;
  heading?: number;
  pitch?: number;
  fov?: number;
  caption?: string;
  /** UNIX microseconds — moment the media was captured */
  capturedAt?: number;
  /** Tag labels to write after the capture is published */
  tags?: string[];
}

export interface PublishedGeoCapture {
  captureId: string;
  captureUri: string;
  capturePath: string;
  fileUri: string;
  tagsPublished: number;
}

/**
 * Publishes a GeoCapture end-to-end:
 *   1. upload primary media blob + PubkyAppFile metadata
 *   2. build + PUT MapkyAppGeoCapture JSON
 *   3. PUT PubkyAppTag JSONs for each pending label
 *   4. fire-and-forget nexus ingest
 */
export async function publishGeoCapture(
  session: PubkySession,
  publicKey: string,
  draft: GeoCaptureDraft,
): Promise<PublishedGeoCapture> {
  const uploaded = await uploadFile(session, publicKey, draft.file);

  const capture = createGeoCapture(publicKey, {
    fileUri: uploaded.fileUri,
    kind: draft.kind,
    lat: draft.lat,
    lon: draft.lon,
    ele: draft.ele,
    heading: draft.heading,
    pitch: draft.pitch,
    fov: draft.fov,
    caption: draft.caption,
    capturedAt: draft.capturedAt,
  });

  await session.storage.putText(
    capture.path as `/pub/${string}`,
    capture.json,
  );

  const captureId = capture.path.split("/").pop()!;

  let tagsPublished = 0;
  if (draft.tags?.length) {
    for (const label of draft.tags) {
      const trimmed = label.trim();
      if (!trimmed) continue;
      try {
        const tag = createGeoCaptureTag(publicKey, publicKey, captureId, trimmed);
        await session.storage.putText(
          tag.path as `/pub/${string}`,
          tag.json,
        );
        tagsPublished += 1;
      } catch (err) {
        console.error(`Failed to publish tag "${trimmed}":`, err);
      }
    }
  }

  void ingestUserIntoNexus(publicKey);

  return {
    captureId,
    captureUri: capture.url,
    capturePath: capture.path,
    fileUri: uploaded.fileUri,
    tagsPublished,
  };
}

export interface SequenceMemberInput {
  file: File;
  kind: GeoCaptureKind;
  /** Per-item EXIF (or fallback) coords. */
  lat: number;
  lon: number;
  /** Per-item heading; falls back to sequenceDraft.heading */
  heading?: number;
  pitch?: number;
  fov?: number;
  /** UNIX microseconds */
  capturedAt?: number;
  /** Per-item caption (rare for sequences — usually left blank) */
  caption?: string;
}

export interface SequenceDraft {
  kind: GeoCaptureKind;
  name?: string;
  description?: string;
  device?: string;
  members: SequenceMemberInput[];
  /** Tags written against the sequence itself. */
  tags?: string[];
}

export interface PublishedSequence {
  sequenceId: string;
  sequenceUri: string;
  memberIds: string[];
  tagsPublished: number;
}

/**
 * Publishes a MapkyAppSequence + N member MapkyAppGeoCaptures.
 * Calls `onProgress(done, total)` after each member write so the UI can show a bar.
 */
export async function publishSequence(
  session: PubkySession,
  publicKey: string,
  draft: SequenceDraft,
  onProgress?: (done: number, total: number) => void,
): Promise<PublishedSequence> {
  if (draft.members.length < 2) {
    throw new Error("A sequence needs at least 2 captures");
  }

  // ── 1. Compute aggregates (timestamp range, bbox) ──────────────────────
  const now = Date.now() * 1000;
  const capturedTimes = draft.members
    .map((m) => m.capturedAt)
    .filter((t): t is number => t != null && t > 0);
  const capturedAtStart = capturedTimes.length ? Math.min(...capturedTimes) : now;
  const capturedAtEnd = capturedTimes.length ? Math.max(...capturedTimes) : now;

  const lats = draft.members.map((m) => m.lat);
  const lons = draft.members.map((m) => m.lon);
  const bbox = {
    minLat: Math.min(...lats),
    minLon: Math.min(...lons),
    maxLat: Math.max(...lats),
    maxLon: Math.max(...lons),
  };

  // ── 2. Create + PUT the sequence record ───────────────────────────────
  const sequence = createSequence(publicKey, {
    kind: draft.kind,
    capturedAtStart,
    capturedAtEnd,
    captureCount: draft.members.length,
    name: draft.name,
    description: draft.description,
    device: draft.device,
    bbox,
  });
  await session.storage.putText(
    sequence.path as `/pub/${string}`,
    sequence.json,
  );

  const sequenceUri = sequence.url;
  const memberIds: string[] = [];
  let published = 0;
  const total = draft.members.length;

  // ── 3. Upload each member file + capture JSON ─────────────────────────
  for (let i = 0; i < draft.members.length; i++) {
    const member = draft.members[i];
    const uploaded = await uploadFile(session, publicKey, member.file);

    const capture = createGeoCapture(publicKey, {
      fileUri: uploaded.fileUri,
      kind: member.kind,
      lat: member.lat,
      lon: member.lon,
      heading: member.heading,
      pitch: member.pitch,
      fov: member.fov,
      caption: member.caption,
      capturedAt: member.capturedAt,
    });

    // Inject sequence linkage — the WASM builder doesn't accept these yet
    // so we mutate the JSON directly before PUT. Both fields MUST be set
    // together per MapkyAppGeoCapture validation.
    const obj = JSON.parse(capture.json) as Record<string, unknown>;
    obj.sequence_uri = sequenceUri;
    obj.sequence_index = i;
    const linkedJson = JSON.stringify(obj);

    await session.storage.putText(
      capture.path as `/pub/${string}`,
      linkedJson,
    );

    memberIds.push(capture.path.split("/").pop()!);
    published += 1;
    onProgress?.(published, total);
  }

  // ── 4. Tags targeting the sequence URI ────────────────────────────────
  let tagsPublished = 0;
  if (draft.tags?.length) {
    for (const label of draft.tags) {
      const trimmed = label.trim();
      if (!trimmed) continue;
      try {
        const tag = createGeoCaptureTag(
          publicKey,
          publicKey,
          sequence.sequenceId,
          trimmed,
        );
        // The tag URI built by createGeoCaptureTag points at a geo_captures
        // path; override the tag to target the sequence URI instead.
        const tagObj = JSON.parse(tag.json) as Record<string, unknown>;
        tagObj.uri = sequenceUri;
        const retargeted = JSON.stringify(tagObj);
        await session.storage.putText(
          tag.path as `/pub/${string}`,
          retargeted,
        );
        tagsPublished += 1;
      } catch (err) {
        console.error(`Failed to publish sequence tag "${trimmed}":`, err);
      }
    }
  }

  void ingestUserIntoNexus(publicKey);

  return {
    sequenceId: sequence.sequenceId,
    sequenceUri,
    memberIds,
    tagsPublished,
  };
}
