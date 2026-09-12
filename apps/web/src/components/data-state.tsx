import { AlertTriangle, Loader2 } from "lucide-react";

export function LoadingState({ label = "Chargement des données" }: { label?: string }) {
  return (
    <div className="flex min-h-48 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600">
      <Loader2 className="mr-2 animate-spin" size={18} />
      {label}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex min-h-32 items-center rounded-lg border border-red-200 bg-red-50 px-4 text-red-800">
      <AlertTriangle className="mr-2 shrink-0" size={18} />
      {message}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-600">
      {message}
    </div>
  );
}
