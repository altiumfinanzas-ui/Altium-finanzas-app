"use client";
import { useEffect } from "react";
import { API_BASE } from "@/lib/authFetch";

export default function FetchPatch() {
  useEffect(() => {
    console.log("✅ FetchPatch montado");

    const origFetch = window.fetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
          ? input.toString()
          : input.url;

      if (url.startsWith(API_BASE)) {
        const token = localStorage.getItem("altium_token");
        console.log("🔧 fetch backend:", url, "token?", !!token);

        if (token) {
          const headers = new Headers(init?.headers || {});
          if (!headers.has("Authorization")) {
            headers.set("Authorization", `Bearer ${token}`);
          }
          init = { ...(init || {}), headers };
        }
      }

      return origFetch(input as any, init);
    };

    return () => {
      window.fetch = origFetch;
    };
  }, []);

  return null;
}

