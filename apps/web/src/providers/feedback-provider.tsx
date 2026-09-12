"use client";
import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Button } from "@as-tino/ui";
type Notice = { id: string; message: string; error: boolean };
type Feedback = { notify: (message: string, error?: boolean) => void; confirm: (message: string) => Promise<boolean> };
const Context = createContext<Feedback | null>(null);
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([]); const [confirmation, setConfirmation] = useState<{ message: string; resolve: (value: boolean) => void } | null>(null);
  const pending = useRef<((value: boolean) => void) | null>(null);
  useEffect(() => () => { pending.current?.(false); pending.current = null; }, []);
  const notify = useCallback((message: string, error = false) => { const id = crypto.randomUUID(); setNotices(list => [...list.slice(-3), { id, message, error }]); setTimeout(() => setNotices(list => list.filter(n => n.id !== id)), error ? 12_000 : 6500); }, []);
  const confirm = useCallback((message: string) => new Promise<boolean>(resolve => { if (pending.current) { resolve(false); return; } pending.current = resolve; setConfirmation({ message, resolve }); }), []);
  const answer = (value: boolean) => { pending.current?.(value); pending.current = null; setConfirmation(null); };
  return <Context.Provider value={{ notify, confirm }}>{children}
    <div className="toast-stack" aria-live="polite" aria-atomic="false">{notices.map(n => <div key={n.id} role={n.error ? "alert" : "status"} className={`toast ${n.error ? "toast-error" : ""}`}><span>{n.message}</span><button aria-label="Fermer la notification" onClick={() => setNotices(list => list.filter(x => x.id !== n.id))}>×</button></div>)}</div>
    <AlertDialog.Root open={!!confirmation} onOpenChange={open => { if (!open) answer(false); }}><AlertDialog.Portal><AlertDialog.Overlay className="dialog-overlay"/><AlertDialog.Content className="dialog-content max-w-lg"><AlertDialog.Title className="text-xl font-bold">Confirmer cette action</AlertDialog.Title><AlertDialog.Description className="my-5 whitespace-pre-line text-slate-600">{confirmation?.message}</AlertDialog.Description><div className="flex justify-end gap-3"><AlertDialog.Cancel asChild><Button variant="secondary" onClick={() => answer(false)}>Annuler</Button></AlertDialog.Cancel><AlertDialog.Action asChild><Button variant="danger" onClick={() => answer(true)}>Confirmer</Button></AlertDialog.Action></div></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root>
  </Context.Provider>;
}
export function useFeedback() { const context = useContext(Context); if (!context) throw new Error("FeedbackProvider manquant"); return context; }
