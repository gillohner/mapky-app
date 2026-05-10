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
  delete(path: `/pub/${string}`): Promise<void>;
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

export interface PublishedSequenceMember {
  id: string;
  fileUri: string;
}

export interface PublishedSequence {
  sequenceId: string;
  sequenceUri: string;
  memberIds: string[];
  /** Same order as draft.members, with the resolved file URI for each. */
  members: PublishedSequenceMember[];
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
  const members: PublishedSequenceMember[] = [];
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

    const id = capture.path.split("/").pop()!;
    memberIds.push(id);
    members.push({ id, fileUri: uploaded.fileUri });
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
    members,
    tagsPublished,
  };
}

export interface AppendToSequenceInput {
  /** Existing sequence id (path tail). Both URI and JSON path are derived from this. */
  sequenceId: string;
  sequenceUri: string;
  /**
   * Current sequence state — needed to rewrite the sequence JSON with
   * unioned aggregates without round-tripping the indexer (the caller
   * already has it). All fields stay as-is on the rewrite except the
   * ones we expand: capturedAt range, bbox, captureCount.
   */
  current: {
    kind: GeoCaptureKind;
    name?: string;
    description?: string;
    device?: string;
    capturedAtStart: number;
    capturedAtEnd: number;
    captureCount: number;
    bbox?: { minLat: number; minLon: number; maxLat: number; maxLon: number };
  };
  /** New captures to append. Each gets sequence_index = currentCount + i. */
  members: SequenceMemberInput[];
  /**
   * Optional tags written against each NEW capture (not the sequence) —
   * appending shouldn't override or duplicate the sequence's existing
   * tags, those stay managed via the sequence detail panel.
   */
  tags?: string[];
}

export interface AppendedSequence {
  sequenceUri: string;
  /** IDs of the newly written captures, in order. */
  newMemberIds: string[];
  /** Same order as input.members, with id + fileUri for cache seeding. */
  newMembers: PublishedSequenceMember[];
  /** Total count after append. */
  newCaptureCount: number;
  /** Number of tag records written (0 if input.tags omitted/empty). */
  tagsPublished: number;
}

/**
 * Append captures to an existing sequence:
 *   1. upload + PUT each new member with sequence_uri + sequence_index
 *   2. PUT a rewritten sequence record with bumped captureCount,
 *      expanded capturedAt range, and unioned bbox
 *   3. write any pending tags against each NEW capture URI (the
 *      sequence's own tags stay untouched — they're owned by the
 *      sequence detail panel)
 *   4. fire-and-forget nexus ingest
 *
 * Same path as `publishSequence` but operates on an existing sequence id
 * instead of generating a new one. Index numbering continues from the
 * current `captureCount` so existing members keep their indices.
 */
export async function appendToSequence(
  session: PubkySession,
  publicKey: string,
  input: AppendToSequenceInput,
  onProgress?: (done: number, total: number) => void,
): Promise<AppendedSequence> {
  if (input.members.length < 1) {
    throw new Error("appendToSequence needs at least one new capture");
  }

  const { current } = input;
  const newMemberIds: string[] = [];
  const newMembers: PublishedSequenceMember[] = [];
  let published = 0;
  const total = input.members.length;

  // ── 1. Upload + PUT each new capture, indexed past current.count ──────
  for (let i = 0; i < input.members.length; i++) {
    const member = input.members[i];
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

    const obj = JSON.parse(capture.json) as Record<string, unknown>;
    obj.sequence_uri = input.sequenceUri;
    obj.sequence_index = current.captureCount + i;
    const linkedJson = JSON.stringify(obj);

    await session.storage.putText(
      capture.path as `/pub/${string}`,
      linkedJson,
    );

    const id = capture.path.split("/").pop()!;
    newMemberIds.push(id);
    newMembers.push({ id, fileUri: uploaded.fileUri });
    published += 1;
    onProgress?.(published, total);
  }

  // ── 2. Recompute aggregates and rewrite the sequence record ───────────
  const newTimes = input.members
    .map((m) => m.capturedAt)
    .filter((t): t is number => t != null && t > 0);
  const capturedAtStart = newTimes.length
    ? Math.min(current.capturedAtStart, ...newTimes)
    : current.capturedAtStart;
  const capturedAtEnd = newTimes.length
    ? Math.max(current.capturedAtEnd, ...newTimes)
    : current.capturedAtEnd;

  const newLats = input.members.map((m) => m.lat);
  const newLons = input.members.map((m) => m.lon);
  const bbox = current.bbox
    ? {
        minLat: Math.min(current.bbox.minLat, ...newLats),
        minLon: Math.min(current.bbox.minLon, ...newLons),
        maxLat: Math.max(current.bbox.maxLat, ...newLats),
        maxLon: Math.max(current.bbox.maxLon, ...newLons),
      }
    : {
        minLat: Math.min(...newLats),
        minLon: Math.min(...newLons),
        maxLat: Math.max(...newLats),
        maxLon: Math.max(...newLons),
      };

  const newCaptureCount = current.captureCount + input.members.length;

  const rewritten = createSequence(publicKey, {
    kind: current.kind,
    capturedAtStart,
    capturedAtEnd,
    captureCount: newCaptureCount,
    name: current.name,
    description: current.description,
    device: current.device,
    bbox,
  });

  // The builder generates a new TimestampId-based path; override to keep
  // the same id so the URI doesn't change and existing members stay linked.
  const sequencePath = `/pub/mapky.app/sequences/${input.sequenceId}`;
  await session.storage.putText(
    sequencePath as `/pub/${string}`,
    rewritten.json,
  );

  // ── 3. Tags targeting each NEW capture URI ────────────────────────────
  // The sequence already has its own tags managed via the sequence
  // detail panel — appending to a sequence shouldn't duplicate or
  // override those. Instead, the labels apply to the captures the user
  // is adding right now.
  let tagsPublished = 0;
  if (input.tags?.length) {
    for (const member of newMembers) {
      for (const label of input.tags) {
        const trimmed = label.trim();
        if (!trimmed) continue;
        try {
          const tag = createGeoCaptureTag(
            publicKey,
            publicKey,
            member.id,
            trimmed,
          );
          await session.storage.putText(
            tag.path as `/pub/${string}`,
            tag.json,
          );
          tagsPublished += 1;
        } catch (err) {
          console.error(
            `Failed to publish tag "${trimmed}" on capture ${member.id}:`,
            err,
          );
        }
      }
    }
  }

  void ingestUserIntoNexus(publicKey);

  return {
    sequenceUri: input.sequenceUri,
    newMemberIds,
    newMembers,
    newCaptureCount,
    tagsPublished,
  };
}

/**
 * Unlink a single capture from a sequence (the capture itself stays;
 * only its `sequence_uri` and `sequence_index` get cleared) and rewrite
 * the sequence record with updated captureCount, capturedAt range, and
 * bbox derived from the remaining members.
 *
 * Caller passes the up-to-date list of remaining members so we don't
 * have to round-trip the indexer for them.
 */
export async function removeCaptureFromSequence(
  session: PubkySession,
  publicKey: string,
  input: {
    sequenceId: string;
    captureId: string;
    /** Original capture JSON-shaped object (we strip the linkage fields and PUT it back). */
    capture: {
      file_uri: string;
      kind: GeoCaptureKind;
      lat: number;
      lon: number;
      ele?: number | null;
      heading?: number | null;
      pitch?: number | null;
      fov?: number | null;
      caption?: string | null;
      captured_at?: number | null;
    };
    /** Remaining members (excluding the one being removed) — used to recompute aggregates. */
    remaining: Array<{
      lat: number;
      lon: number;
      captured_at?: number | null;
    }>;
    /** Current sequence metadata; we keep these unchanged on rewrite. */
    current: {
      kind: GeoCaptureKind;
      name?: string;
      description?: string;
      device?: string;
    };
  },
): Promise<void> {
  // 1. Rewrite the capture JSON without sequence linkage.
  const cap = input.capture;
  const built = createGeoCapture(publicKey, {
    fileUri: cap.file_uri,
    kind: cap.kind,
    lat: cap.lat,
    lon: cap.lon,
    ele: cap.ele ?? undefined,
    heading: cap.heading ?? undefined,
    pitch: cap.pitch ?? undefined,
    fov: cap.fov ?? undefined,
    caption: cap.caption ?? undefined,
    capturedAt: cap.captured_at ?? undefined,
  });
  await session.storage.putText(
    `/pub/mapky.app/geo_captures/${input.captureId}` as `/pub/${string}`,
    built.json,
  );

  // 2. Rewrite the sequence record with recomputed aggregates.
  const lats = input.remaining.map((m) => m.lat);
  const lons = input.remaining.map((m) => m.lon);
  const times = input.remaining
    .map((m) => m.captured_at)
    .filter((t): t is number => t != null && t > 0);

  if (input.remaining.length === 0) {
    // No members left — the sequence has no shape to compute. Delete it
    // instead of leaving an empty record.
    await session.storage.delete(
      `/pub/mapky.app/sequences/${input.sequenceId}` as `/pub/${string}`,
    );
    void ingestUserIntoNexus(publicKey);
    return;
  }

  const now = Date.now() * 1000;
  const rewritten = createSequence(publicKey, {
    kind: input.current.kind,
    capturedAtStart: times.length ? Math.min(...times) : now,
    capturedAtEnd: times.length ? Math.max(...times) : now,
    captureCount: input.remaining.length,
    name: input.current.name,
    description: input.current.description,
    device: input.current.device,
    bbox: {
      minLat: Math.min(...lats),
      minLon: Math.min(...lons),
      maxLat: Math.max(...lats),
      maxLon: Math.max(...lons),
    },
  });
  await session.storage.putText(
    `/pub/mapky.app/sequences/${input.sequenceId}` as `/pub/${string}`,
    rewritten.json,
  );

  void ingestUserIntoNexus(publicKey);
}
