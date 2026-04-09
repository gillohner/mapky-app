import { config } from "@/lib/config";
import { nexusClient } from "./client";
import type { NexusUserDetails } from "@/types/mapky";

export function getPubkyAvatarUrl(publicKey: string): string {
  const baseURL = import.meta.env.DEV ? "" : config.gateway.url;
  return `${baseURL}${config.gateway.baseAvatarPath}/${publicKey}`;
}

/**
 * Resolve a pubky:// file URI to a gateway HTTP URL.
 * e.g. pubky://{userId}/pub/pubky.app/files/{fileId} → {gateway}/static/files/{userId}/{fileId}
 */
export function resolveFileUrl(pubkyUri: string): string | null {
  const match = pubkyUri.match(/^pubky:\/\/([^/]+)\/pub\/pubky\.app\/files\/(.+)$/);
  if (!match) return null;
  const [, userId, fileId] = match;
  const baseURL = import.meta.env.DEV ? "" : config.gateway.url;
  return `${baseURL}${config.gateway.baseFilePath}/${userId}/${fileId}`;
}

export function getInitials(name: string | undefined | null): string {
  if (!name) return "";
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function truncatePublicKey(key: string | null, chars = 8): string {
  if (!key) return "";
  return `${key.slice(0, chars)}...${key.slice(-4)}`;
}

export async function fetchUserProfile(
  userId: string,
): Promise<NexusUserDetails> {
  const { data } = await nexusClient.get(`/v0/user/${userId}`);
  return data.details ?? data;
}
