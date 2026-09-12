"use client";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { Button } from "@as-tino/ui";
import { EmptyState, ErrorState, LoadingState } from "./data-state";
import type { ApiList } from "../lib/types";

function headerLabel<T>(column: ColumnDef<T>): string {
  return typeof column.header === "string" ? column.header : "";
}

export function DataTable<T extends { id: string }>({
  data, columns, loading, error, page = 1, onPage, title = "Liste", retry
}: {
  data?: ApiList<T>;
  columns: ColumnDef<T>[];
  loading?: boolean;
  error?: Error | null;
  page?: number;
  onPage?: (page: number) => void;
  title?: string;
  retry?: () => void;
}) {
  const table = useReactTable({
    data: data?.items ?? [], columns, getCoreRowModel: getCoreRowModel(), getRowId: row => row.id
  });
  if (loading) return <LoadingState/>;
  if (error) return <div><ErrorState message={error.message}/>{retry && <Button className="mt-3" onClick={retry}>Réessayer</Button>}</div>;
  if (!data?.items.length) return <EmptyState message="Aucun résultat. Modifiez vos filtres ou créez un premier enregistrement."/>;
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return <div className="table-card">
    <div className="data-table-desktop overflow-x-auto">
      <table>
        <caption className="sr-only">{title}</caption>
        <thead>{table.getHeaderGroups().map(group => <tr key={group.id}>{group.headers.map(header => <th key={header.id} scope="col">{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead>
        <tbody>{table.getRowModel().rows.map(row => <tr key={row.id}>{row.getVisibleCells().map(cell => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody>
      </table>
    </div>

    <div className="data-cards" aria-label={title}>
      {table.getRowModel().rows.map(row => <article className="data-card" key={row.id}>
        {row.getVisibleCells().map(cell => {
          const label = headerLabel(cell.column.columnDef);
          return <div className={`data-card-field ${label === "Actions" ? "data-card-actions" : ""}`} key={cell.id}>
            {label && <span className="data-card-label">{label}</span>}
            <div className="data-card-value">{flexRender(cell.column.columnDef.cell, cell.getContext())}</div>
          </div>;
        })}
      </article>)}
    </div>

    <div className="table-footer"><span>{data.total} résultat{data.total > 1 ? "s" : ""} · Page {page} / {pages}</span>{onPage && <div className="flex gap-2"><Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page-1)}>Précédent</Button><Button variant="secondary" disabled={page >= pages} onClick={() => onPage(page+1)}>Suivant</Button></div>}</div>
  </div>;
}
