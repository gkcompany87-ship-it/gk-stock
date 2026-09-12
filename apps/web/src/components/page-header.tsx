import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  action
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-header mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="page-header-copy">
        <h1 className="text-2xl font-black tracking-normal text-slate-950 md:text-3xl">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm text-slate-600">{description}</p> : null}
      </div>
      {action ? <div className="page-header-action">{action}</div> : null}
    </div>
  );
}
