"use client";
import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, queryString } from "../lib/api";
import { useDebounced } from "../lib/hooks";
import type { ApiList } from "../lib/types";
/** Remote, paginated lookup; it does not silently cap the selectable catalogue at 100 records. */
export function SearchSelect<T extends { id: string }>({ path, value, selectedLabel, onChange, label, display, required = false }: { path: string; value: string; selectedLabel?: string; onChange: (item: T | null) => void; label: string; display: (item: T) => string; required?: boolean }) {
  const id = useId(); const [search, setSearch] = useState(""); const [open, setOpen] = useState(false); const debounced = useDebounced(search);
  const query = useQuery({ queryKey: ["lookup", path, debounced], queryFn: () => apiFetch<ApiList<T>>(`${path}${queryString({ search: debounced, pageSize: 20 })}`), enabled: open });
  return <div className="relative"><label className="field-label" htmlFor={id}>{label}{required ? " *" : ""}</label><div className="flex gap-2"><input id={id} value={open ? search : selectedLabel ?? ""} placeholder={value ? "Sélection conservée" : "Rechercher..."} autoComplete="off" onFocus={() => { setOpen(true); setSearch(""); }} onChange={e => { setOpen(true); setSearch(e.target.value); }} aria-controls={`${id}-results`} aria-expanded={open}/>{value && <button type="button" className="quiet-button" onClick={() => { onChange(null); setSearch(""); }}>Effacer</button>}</div>
    {open && <div id={`${id}-results`} className="lookup-results"><button type="button" className="lookup-option text-slate-500" onClick={() => setOpen(false)}>Fermer la recherche</button>{query.isPending && <p className="p-3 text-sm">Recherche...</p>}{query.error && <p className="p-3 text-sm text-red-700">{query.error.message}</p>}{query.data?.items.map(item => <button className="lookup-option" type="button" key={item.id} onClick={() => { onChange(item); setOpen(false); }}>{display(item)}</button>)}{query.data?.total === 0 && <p className="p-3 text-sm">Aucun résultat.</p>}{(query.data?.total ?? 0) > 20 && <p className="p-3 text-xs text-slate-500">Affinez votre recherche pour retrouver les autres résultats.</p>}</div>}
  </div>;
}
