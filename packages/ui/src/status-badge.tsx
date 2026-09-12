const tones = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  slate: "bg-slate-50 text-slate-700 ring-slate-200",
  teal: "bg-teal-50 text-teal-700 ring-teal-200"
} as const;

export function StatusBadge({
  children,
  tone = "slate"
}: {
  children: string;
  tone?: keyof typeof tones;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
