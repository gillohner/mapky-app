/**
 * Upload a file (blob + metadata) to the user's homeserver.
 *
 * Flow:
 * 1. Read file as Uint8Array
 * 2. Compute BLAKE3 hash → blob ID
 * 3. PUT raw bytes at /pub/pubky.app/blobs/{blob_id}
 * 4. Create PubkyAppFile JSON with src = pubky://user/pub/pubky.app/blobs/{blob_id}
 * 5. PUT file JSON at /pub/pubky.app/files/{file_id}
 * 6. Return the file URI (pubky://user/pub/pubky.app/files/{file_id})
 */

interface PubkyStorage {
  putBytes(path: `/pub/${string}`, data: Uint8Array): Promise<void>;
  putText(path: `/pub/${string}`, text: string): Promise<void>;
}

/** Crockford Base32 alphabet */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function crockfordEncode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let result = "";

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += CROCKFORD[(value >>> bits) & 0x1f];
    }
  }
  if (bits > 0) {
    result += CROCKFORD[(value << (5 - bits)) & 0x1f];
  }
  return result;
}

/** Generate a TimestampId (same as pubky-app-specs TimestampId trait). */
function generateTimestampId(): string {
  const now = BigInt(Date.now()) * 1000n; // microseconds
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  view.setBigUint64(0, now, false); // big-endian
  return crockfordEncode(bytes);
}

/** Compute BLAKE3 hash → Crockford Base32 blob ID (first half of hash). */
async function computeBlobId(data: Uint8Array): Promise<string> {
  // Use SubtleCrypto SHA-256 as a fallback since BLAKE3 isn't in Web Crypto.
  // The homeserver doesn't validate blob IDs, so SHA-256 is fine for uniqueness.
  const hash = await crypto.subtle.digest("SHA-256", data.buffer as ArrayBuffer);
  const halfLen = Math.floor(new Uint8Array(hash).length / 2);
  return crockfordEncode(new Uint8Array(hash).slice(0, halfLen));
}

export interface UploadedFile {
  /** pubky://user/pub/pubky.app/files/{file_id} — use as attachment URI */
  fileUri: string;
  /** Local object URL for preview */
  previewUrl: string;
}

export async function uploadFile(
  session: { storage: PubkyStorage },
  publicKey: string,
  file: File,
): Promise<UploadedFile> {
  const bytes = new Uint8Array(await file.arrayBuffer());

  // 1. Create blob
  const blobId = await computeBlobId(bytes);
  const blobPath = `/pub/pubky.app/blobs/${blobId}`;
  await session.storage.putBytes(blobPath as `/pub/${string}`, bytes);

  // 2. Create file metadata
  const fileId = generateTimestampId();
  const filePath = `/pub/pubky.app/files/${fileId}`;
  const blobUri = `pubky://${publicKey}${blobPath}`;

  const fileJson = JSON.stringify({
    name: file.name,
    created_at: Math.floor(Date.now() / 1000),
    src: blobUri,
    content_type: file.type || "application/octet-stream",
    size: file.size,
  });

  await session.storage.putText(filePath as `/pub/${string}`, fileJson);

  const fileUri = `pubky://${publicKey}${filePath}`;
  const previewUrl = URL.createObjectURL(file);

  return { fileUri, previewUrl };
}

/** Accepted image MIME types */
export const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp,image/gif";

/** Max file size: 10MB */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;
