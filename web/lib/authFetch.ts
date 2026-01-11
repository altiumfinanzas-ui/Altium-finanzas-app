// web/lib/authFetch.ts
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "https://altium-finanzas-app.onrender.com";

export function authFetch(input: RequestInfo, init: RequestInit = {}) {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("altium_token") : null;

  const headers = new Headers(init.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);

  // Si NO es FormData, seteamos JSON por defecto
  if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
console.log("AUTHFETCH TOKEN:", token);
console.log("AUTHFETCH INPUT:", input);
console.log("AUTHFETCH HEADERS AUTH:", headers.get("Authorization"));

  return fetch(input, { ...init, headers });
}

