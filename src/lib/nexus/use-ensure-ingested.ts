import { useEffect } from "react";
import { ingestUserIntoNexus } from "./ingest";

/**
 * Per-session set of users we've already asked nexus to register.
 * Module-scoped so multiple `useEnsureIngested` calls for the same id
 * across different surfaces only fire ONE `/v0/ingest/{id}` request.
 *
 * `ingestUserIntoNexus` is the registration call — nexus enrolls the
 * user with its homeserver-watcher and keeps the user's data fresh
 * from that point on. Re-calling it isn't needed, just wasteful: we
 * track who we've already asked.
 *
 * On a hard ingest failure we drop the id so a transient error can't
 * permanently lock the user out of being re-tried later in the session.
 */
const ingestRequested = new Set<string>();

/**
 * Ensure nexus has been told to index `userId`'s homeserver. Fires
 * `POST /v0/ingest/{id}` exactly once per user per session.
 *
 * Mount alongside any `useUserProfile(authorId)` call where the
 * author may be unknown to the running nexus instance — typically
 * surfaces that render content authored by a stranger (post
 * threads, review lists, reply threads). Surfaces that only render
 * the CURRENT user's profile (rail avatar, mobile nav) don't need
 * this hook: the login flow already calls `ingestUserIntoNexus`
 * for the signed-in user.
 *
 * The hook intentionally does NOT block rendering. Profile queries
 * stay 404 until the watcher finishes the first index; their cached
 * fallbacks (avatar initial, raw pubky id) cover the gap. Once the
 * watcher writes the user, the next refetch picks it up.
 */
export function useEnsureIngested(userId: string | null | undefined): void {
  useEffect(() => {
    if (!userId) return;
    if (ingestRequested.has(userId)) return;
    ingestRequested.add(userId);
    void ingestUserIntoNexus(userId).catch(() => {
      // Drop on failure so a transient ingest error doesn't
      // permanently lock the user out of being re-tried later.
      ingestRequested.delete(userId);
    });
  }, [userId]);
}
