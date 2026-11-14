"use client";

import { useCallback, useRef } from "react";

import { requestReactorJwt } from "@/lib/orbis";

/**
 * JWT plumbing shared by every ReactorProvider in the app (the starter and the
 * flight deck). One token request is cached per session; `clearJwt` drops it
 * after a disconnect so the next connect mints a fresh one.
 */
export function useReactorJwt() {
  const jwtPromise = useRef<Promise<string> | null>(null);
  const currentJwt = useRef<string | null>(null);

  const getJwt = useCallback(async () => {
    const pending = (jwtPromise.current ??= requestReactorJwt());
    try {
      const jwt = await pending;
      currentJwt.current = jwt;
      return jwt;
    } catch (error) {
      // Do not permanently cache a failed token request.
      if (jwtPromise.current === pending) jwtPromise.current = null;
      throw error;
    }
  }, []);

  const getCurrentJwt = useCallback(() => currentJwt.current, []);

  const clearJwt = useCallback(() => {
    jwtPromise.current = null;
    currentJwt.current = null;
  }, []);

  return { getJwt, getCurrentJwt, clearJwt };
}
