import { useRouter } from "@tanstack/react-router";

/**
 * Close-button helper for detail panels. Tries `router.history.back()`
 * so the user lands back on the parent list with its tab + URL state
 * intact. If there's no history (deep link, fresh tab), falls back to
 * an explicit navigate so the user still gets somewhere usable.
 *
 * Usage:
 *   const close = useBackOr(() => navigate({ to: "/collections" }));
 *   <button onClick={close}>×</button>
 */
export function useBackOr(fallback: () => void): () => void {
  const router = useRouter();
  return () => {
    // window.history.length is "1" on a freshly-opened tab. Anything
    // higher means there's at least one prior entry to pop back to.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.history.back();
    } else {
      fallback();
    }
  };
}
