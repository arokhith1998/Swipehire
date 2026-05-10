/**
 * Re-export of the canonical apiRequest + getQueryFn from queryClient.
 *
 * Some pages import from "@/lib/api"; others from "@/lib/queryClient".
 * Keeping both pointing at the same implementation avoids drift.
 */
export { apiRequest, apiFetch, getQueryFn, queryClient } from "./queryClient";
