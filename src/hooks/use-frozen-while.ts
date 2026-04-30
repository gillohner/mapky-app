import { useRef } from "react";

/**
 * Returns `value` while `frozen` is false; once `frozen` flips true,
 * the returned reference stays pinned to whatever the value was at
 * the moment of the freeze, even as `value` continues to change.
 *
 * Used by the discover lists to keep their source bbox stable while
 * a filter is active — otherwise `useFilterViewport`'s fitBounds
 * would tighten the map, shrink the viewport-bbox query, drop
 * places out of the result, and make the filtered list look like it
 * lost matches just because the map moved.
 *
 * Safe to mutate the ref during render here — we only update when
 * `frozen` is false, so the ref is always read-only during render
 * passes that consume the frozen value.
 */
export function useFrozenWhile<T>(value: T, frozen: boolean): T {
  const ref = useRef(value);
  if (!frozen) ref.current = value;
  return ref.current;
}
