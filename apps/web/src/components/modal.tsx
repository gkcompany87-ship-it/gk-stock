"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
export function Modal({ open, onClose, title, description, children, wide = false }: { open: boolean; onClose: () => void; title: string; description: string; children: ReactNode; wide?: boolean }) {
  return <Dialog.Root open={open} onOpenChange={value => { if (!value) onClose(); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content className={`dialog-content ${wide ? "dialog-wide" : ""}`}><div className="mb-5 pr-9"><Dialog.Title className="text-xl font-bold">{title}</Dialog.Title><Dialog.Description className="mt-1 text-sm text-slate-600">{description}</Dialog.Description></div><Dialog.Close aria-label="Fermer" className="dialog-close"><X size={20}/></Dialog.Close>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}
