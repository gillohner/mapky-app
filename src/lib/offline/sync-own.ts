import {
  fetchUserGeoCaptures,
  fetchUserPosts,
  fetchUserReviews,
  fetchUserRoutes,
  fetchUserSequences,
  fetchUserIncidents,
} from "@/lib/api/mapky";
import { clearUserOwnResources, putOwnResources } from "./own-resources";
import type { OwnResource, OwnResourceType } from "./db";

/**
 * Eagerly mirror all of the signed-in user's MapKy resources into the
 * local `own_resources` IDB store so detail pages and search work even
 * when the network drops. Called on sign-in completion and again
 * whenever the browser comes back online.
 *
 * Per-type pulls are issued in parallel; one type failing does not
 * abort the others — partial mirrors are still useful, and we log
 * per-type failures for the settings page to surface later.
 */

export interface SyncSummary {
  startedAt: number;
  finishedAt: number;
  perType: Record<OwnResourceType, SyncOutcome>;
}

interface SyncOutcome {
  count: number;
  error?: string;
}

const MAPKY_PATHS: Record<OwnResourceType, string> = {
  post: "/pub/mapky.app/posts",
  review: "/pub/mapky.app/posts", // reviews share the posts path
  incident: "/pub/mapky.app/incidents",
  geoCapture: "/pub/mapky.app/geo_captures",
  sequence: "/pub/mapky.app/sequences",
  route: "/pub/mapky.app/routes",
};

function buildPath(type: OwnResourceType, id: string): string {
  return `${MAPKY_PATHS[type]}/${id}`;
}

async function syncType(
  userId: string,
  type: OwnResourceType,
  fetcher: () => Promise<Array<{ id: string }>>,
): Promise<SyncOutcome> {
  try {
    const items = await fetcher();
    const now = Date.now();
    const records: OwnResource[] = items.map((item) => ({
      userId,
      type,
      id: item.id,
      body: item,
      path: buildPath(type, item.id),
      updatedAt: now,
      syncedAt: now,
    }));
    await putOwnResources(records);
    return { count: records.length };
  } catch (err) {
    return {
      count: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function syncOwnResources(
  userId: string,
  opts: { reset?: boolean } = {},
): Promise<SyncSummary> {
  const startedAt = Date.now();
  if (opts.reset) {
    await clearUserOwnResources(userId);
  }

  const [post, review, incident, geoCapture, sequence, route] =
    await Promise.all([
      syncType(userId, "post", () => fetchUserPosts(userId)),
      syncType(userId, "review", () => fetchUserReviews(userId)),
      syncType(userId, "incident", () => fetchUserIncidents(userId)),
      syncType(userId, "geoCapture", () => fetchUserGeoCaptures(userId)),
      syncType(userId, "sequence", () => fetchUserSequences(userId)),
      syncType(userId, "route", () => fetchUserRoutes(userId)),
    ]);

  return {
    startedAt,
    finishedAt: Date.now(),
    perType: {
      post,
      review,
      incident,
      geoCapture,
      sequence,
      route,
    },
  };
}
