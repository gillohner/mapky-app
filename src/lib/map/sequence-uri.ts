/**
 * Parse a `pubky://<author>/pub/mapky.app/sequences/<id>` URI back
 * into the author + sequence id pair the indexer's API takes. Used by
 * the capture layers and the detail panel — kept here so both can
 * agree on the format without one importing the other's component.
 */
export function parseSequenceUri(
  uri: string | null,
): { authorId: string; sequenceId: string } | null {
  if (!uri) return null;
  const m = uri.match(/^pubky:\/\/([^/]+)\/pub\/mapky\.app\/sequences\/(.+)$/);
  if (!m) return null;
  return { authorId: m[1], sequenceId: m[2] };
}
