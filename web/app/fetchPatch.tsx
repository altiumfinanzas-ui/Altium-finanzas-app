"use client";

import { useEffect } from "react";

export default function FetchPatch() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const origFetch = window.fetch;

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const token = window.localStorage.getItem("altium_token");

      const headers = new Headers(init?.headers || {});
      if (token && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }

      return origFetch(input, { ...(init || {}), headers });
    };

    return () => {
      window.fetch = origFetch;
    };
  }, []);

  return null;
}

