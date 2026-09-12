import { useId, type ReactNode } from "react";
export function FormField({ label, error, children, className = "" }: { label: string; error?: string; children: ReactNode; className?: string }) {
  const id = useId();
  return <label className={className}><span className="field-label">{label}</span>{children}{error && <span className="form-error block" id={id} role="alert">{error}</span>}</label>;
}
export function FormError({ error }: { error?: string | null }) { return error ? <p className="form-error rounded-lg bg-red-50 p-3" role="alert">{error}</p> : null; }
