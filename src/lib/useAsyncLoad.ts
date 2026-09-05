import { useCallback, useEffect, useRef, useState } from "react";

export type LoadStatus = "loading" | "ready" | "error";

/** Slower than this and we tell the user something's off, rather than
 *  leaving them staring at a bare "Loading…" forever. */
const SLOW_HINT_MS = 8000;

/**
 * Wraps a page's data-fetch in status/error/timeout tracking, so a network
 * hiccup or a silently-rejected promise shows a retry button instead of an
 * infinite "Loading…" (the failure mode that was hitting production).
 */
export function useAsyncLoad(loadFn: () => Promise<void>, deps: unknown[]) {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const runIdRef = useRef(0);

  const run = useCallback(() => {
    const runId = ++runIdRef.current;
    setStatus("loading");
    setError(null);
    setSlow(false);
    const timer = setTimeout(() => {
      if (runIdRef.current === runId) setSlow(true);
    }, SLOW_HINT_MS);

    loadFn()
      .then(() => {
        if (runIdRef.current === runId) setStatus("ready");
      })
      .catch((e) => {
        if (runIdRef.current !== runId) return;
        setError(e instanceof Error ? e.message : "Something went wrong loading this page.");
        setStatus("error");
      })
      .finally(() => clearTimeout(timer));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    run();
  }, [run]);

  return { status, error, slow, retry: run };
}
