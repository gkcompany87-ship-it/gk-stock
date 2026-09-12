import { Card, CardBody, CardHeader } from "@as-tino/ui";
import type { ReactNode } from "react";
import { EmptyState } from "./data-state";

export function DataStateTable({ title, columns, rows }: { title: string; columns: string[]; rows: ReactNode[][] }) {
  return <Card>
    <CardHeader><h2 className="text-base font-black text-slate-950">{title}</h2></CardHeader>
    <CardBody className="p-0">
      {rows.length ? <>
        <div className="data-table-desktop overflow-x-auto"><table><thead><tr>{columns.map(column => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row,rowIndex)=><tr key={rowIndex}>{row.map((cell,cellIndex)=><td key={`${rowIndex}-${cellIndex}`}>{cell}</td>)}</tr>)}</tbody></table></div>
        <div className="data-cards p-3">{rows.map((row,rowIndex)=><article className="data-card" key={rowIndex}>{row.map((cell,cellIndex)=><div className="data-card-field" key={`${rowIndex}-${cellIndex}`}><span className="data-card-label">{columns[cellIndex] ?? ""}</span><div className="data-card-value">{cell}</div></div>)}</article>)}</div>
      </> : <div className="p-5"><EmptyState message="Aucune donnée à afficher."/></div>}
    </CardBody>
  </Card>;
}
