"use client";
import { useEffect, useRef, useState } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { apiFetch, queryString, ApiError } from "./api";
import type { ApiList } from "./types";
import { useFeedback } from "../providers/feedback-provider";
export function useOnline() { const [online, setOnline] = useState(true); useEffect(() => { const update = () => setOnline(navigator.onLine); update(); window.addEventListener("online", update); window.addEventListener("offline", update); return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); }; }, []); return online; }
export function useDebounced<T>(value: T, delay = 250) { const [result, setResult] = useState(value); useEffect(() => { const timer = setTimeout(() => setResult(value), delay); return () => clearTimeout(timer); }, [value, delay]); return result; }
export function useList<T>(path: string, extra: Record<string, string | number | undefined> = {}) {
  const [page, setPage] = useState(1); const [search, setSearch] = useState(""); const [status, setStatus] = useState(""); const debounced = useDebounced(search);
  const signature = JSON.stringify(extra);
  useEffect(() => { setPage(1); }, [debounced, status, signature]);
  const query = useQuery({ queryKey: [path, page, debounced, status, extra], queryFn: () => apiFetch<ApiList<T>>(`${path}${queryString({ page, pageSize: 20, search: debounced, status, ...extra })}`) });
  return { ...query, page, setPage, search, setSearch, status, setStatus };
}
/** Retain the key after an ambiguous failure; clear only after a confirmed success. */
export function useAction() {
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const active = useRef(false); const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const cache = useQueryClient(); const { notify } = useFeedback();
  async function run<T>(path: string, body?: unknown, options: { method?: string; bodyKey?: boolean; message?: string } = {}): Promise<T | undefined> {
    if (active.current) return undefined;
    active.current = true; setBusy(true); setError(null);
    const fingerprint = JSON.stringify([path, options.method ?? "POST", body]);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    const key = retry.current.key;
    try {
      const json = options.bodyKey ? { ...(body as Record<string, unknown>), idempotencyKey: key } : body;
      const result = await apiFetch<T>(path, { method: options.method ?? "POST", json, headers: { "Idempotency-Key": key } });
      retry.current = null; await cache.invalidateQueries(); notify(options.message ?? "Op\u00e9ration enregistr\u00e9e."); return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : "L'op\u00e9ration a \u00e9chou\u00e9.";
      const full = e instanceof ApiError && e.requestId ? `${message} R\u00e9f. ${e.requestId}` : message;
      setError(full); notify(full, true); return undefined;
    } finally { active.current = false; setBusy(false); }
  }
  return { run, busy, error, clearError: () => setError(null) };
}
