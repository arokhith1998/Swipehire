import { QueryClient, QueryFunction } from "@tanstack/react-query";

/**
 * Base URL for API calls.
 *  - In dev: empty string → vite proxies /api to localhost:5000.
 *  - In prod: VITE_API_URL=https://api.swipehire.io (no trailing slash).
 */
const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

function url(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Drop-in replacement for `fetch` that:
 *  - Prefixes /api/* paths with VITE_API_URL (so prod hits api.swipehire.io)
 *  - Always sends cookies (credentials: include) for cross-subdomain auth
 *
 * Use this anywhere a page used to call `fetch("/api/...")` directly.
 */
export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(url(input), {
    ...init,
    credentials: "include",
  });
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  path: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url(path), {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(url(queryKey[0] as string), {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
