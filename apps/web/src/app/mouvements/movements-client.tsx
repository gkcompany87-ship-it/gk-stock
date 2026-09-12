"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, Boxes, PackageCheck, PackageMinus, PackageX, Plus, RotateCcw, Search, Warehouse as WarehouseIcon } from "lucide-react";
import { Button } from "@as-tino/ui";
import { StockMovementTypes } from "@as-tino/shared";
import { apiFetch } from "../../lib/api";
import { useAction, useList } from "../../lib/hooks";
import { date, quantity } from "../../lib/format";
import type { StockMovement, Warehouse, Product, Incident, ManagedUser, ApiList, StockOverview } from "../../lib/types";
import { useAuth } from "../../providers/auth-provider";
import { useFeedback } from "../../providers/feedback-provider";
import { PageHeader } from "../../components/page-header";
import { DataTable } from "../../components/data-table";
import { Modal } from "../../components/modal";
import { FormField, FormError } from "../../components/form-field";
import { SearchSelect } from "../../components/search-select";
import { StatusLabel, statusText } from "../../components/status-label";

export function MovementsClient() {
  const { can } = useAuth();
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [userId, setUserId] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [reason, setReason] = useState<{ movement: StockMovement; reverse: boolean } | null>(null);
  const [incidents, setIncidents] = useState(false);
  const list = useList<StockMovement>("/stock-movements", {
    type,
    productId: product?.id,
    userId,
    dateFrom: from ? `${from}T00:00:00+01:00` : undefined,
    dateTo: to ? `${to}T23:59:59.999+01:00` : undefined
  });
  const overview = useQuery({ queryKey: ["/stock-movements/overview"], queryFn: () => apiFetch<StockOverview>("/stock-movements/overview") });
  const users = useQuery({ queryKey: ["/users", "filter"], queryFn: () => apiFetch<ApiList<ManagedUser>>("/users?pageSize=100"), enabled: can("user:manage") });
  const hasFilters = !!(type || from || to || userId || product);
  const clearFilters = () => { setType(""); setFrom(""); setTo(""); setUserId(""); setProduct(null); list.setSearch(""); };

  const columns: ColumnDef<StockMovement>[] = [
    { header: "Date", cell: ({ row }) => <div><strong className="text-xs">{date(row.original.createdAt, true)}</strong><p className="text-[10px] text-slate-400">{row.original.warehouse?.name ?? "Dépôt"}</p></div> },
    { header: "Produit", cell: ({ row }) => <div><strong>{row.original.product.name}</strong><p className="text-xs text-slate-500">{row.original.product.sku}</p></div> },
    { header: "Type", cell: ({ row }) => <StatusLabel status={row.original.type}/> },
    { header: "Quantité", cell: ({ row }) => <strong>{quantity(row.original.quantity)} {row.original.product.unit}</strong> },
    { header: "Stock", cell: ({ row }) => <div className="movement-balance"><span>{quantity(row.original.quantityBefore)}</span><span>→</span><strong>{quantity(row.original.quantityAfter)}</strong></div> },
    { header: "Auteur", cell: ({ row }) => <div><strong className="text-xs">{row.original.user?.name ?? "-"}</strong>{row.original.note && <p className="movement-note">{row.original.note}</p>}</div> },
    { header: "Actions", cell: ({ row }) => <div className="flex flex-wrap gap-2">{can("stock:adjust") && !row.original.deliveryNoteId && !row.original.reversedMovementId && !row.original.reversalMovement && <button className="quiet-button danger" onClick={() => setReason({ movement: row.original, reverse: true })}>Inverser</button>}{can("stock:report-mistake") && <button className="quiet-button" onClick={() => setReason({ movement: row.original, reverse: false })}>Signaler</button>}{row.original.reversalMovement && <span className="text-xs text-slate-500">Déjà inversé</span>}</div> }
  ];

  return <>
    <PageHeader
      title="Stock & mouvements"
      description={can("stock:read-all") ? "Une vue claire du niveau de stock et de chaque entrée, sortie ou correction enregistrée." : "Consultez vos opérations et signalez une erreur à un administrateur si nécessaire."}
      action={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setIncidents(true)}><AlertTriangle size={16}/>Signalements{overview.data?.openIncidentCount ? ` (${overview.data.openIncidentCount})` : ""}</Button>{can("stock:adjust") && <Button onClick={() => setCreating(true)}><Plus size={16}/>Nouveau mouvement</Button>}</div>}
    />

    <section className="stock-overview-grid" aria-label="Résumé du stock">
      <article className="stock-overview-card"><span className="stock-overview-icon"><Boxes size={19}/></span><div><small>Quantité en stock</small><strong>{overview.data ? quantity(overview.data.totalStockQuantity) : "-"}</strong><p>{overview.data?.productCount ?? "-"} produit{overview.data?.productCount === 1 ? "" : "s"} actif{overview.data?.productCount === 1 ? "" : "s"}</p></div></article>
      <article className="stock-overview-card success"><span className="stock-overview-icon"><PackageCheck size={19}/></span><div><small>{can("stock:read-all") ? "Entrées - 24 h" : "Vos entrées - 24 h"}</small><strong>+ {overview.data ? quantity(overview.data.entries24h) : "-"}</strong><p>{overview.data?.movementCount24h ?? "-"} mouvement{overview.data?.movementCount24h === 1 ? "" : "s"} sur 24 h</p></div></article>
      <article className="stock-overview-card outgoing"><span className="stock-overview-icon"><PackageMinus size={19}/></span><div><small>{can("stock:read-all") ? "Sorties - 24 h" : "Vos sorties - 24 h"}</small><strong>- {overview.data ? quantity(overview.data.withdrawals24h) : "-"}</strong><p>Quantités sorties du stock</p></div></article>
      <article className="stock-overview-card warning"><span className="stock-overview-icon"><AlertTriangle size={19}/></span><div><small>Stock faible</small><strong>{overview.data?.lowStockCount ?? "-"}</strong><p>Au seuil minimum ou en dessous</p></div></article>
      <article className="stock-overview-card danger"><span className="stock-overview-icon"><PackageX size={19}/></span><div><small>Ruptures</small><strong>{overview.data?.outOfStockCount ?? "-"}</strong><p>Produits à zéro ou négatif</p></div></article>
      <article className="stock-overview-card incident"><span className="stock-overview-icon"><AlertTriangle size={19}/></span><div><small>Signalements ouverts</small><strong>{overview.data?.openIncidentCount ?? "-"}</strong><p>À vérifier par un responsable</p></div></article>
    </section>

    {!!overview.data?.warehouseBreakdown.length && <section className="warehouse-strip" aria-label="Stock par dépôt">
      <div className="warehouse-strip-heading"><div><WarehouseIcon size={18}/><span>Stock par dépôt</span></div><small>{overview.data.warehouseCount} dépôt{overview.data.warehouseCount > 1 ? "s" : ""} actif{overview.data.warehouseCount > 1 ? "s" : ""}</small></div>
      <div className="warehouse-strip-list">{overview.data.warehouseBreakdown.map(warehouse => <article key={warehouse.id}><span>{warehouse.name}</span><small>{warehouse.code}</small><strong>{quantity(warehouse.quantity)}</strong></article>)}</div>
    </section>}

    <section className="stock-register-panel">
      <div className="stock-register-heading"><div><h2>Registre des mouvements</h2><p>{can("stock:read-all") ? "Historique immuable de toutes les opérations de stock." : "Historique de vos propres opérations."}</p></div><span>{list.data?.total ?? 0} résultat{list.data?.total === 1 ? "" : "s"}</span></div>
      <div className="stock-filter-bar">
        <div className="stock-product-filter"><Search size={16}/><SearchSelect<Product> path="/products" label="Produit" value={product?.id ?? ""} selectedLabel={product?.name} display={item => `${item.sku} - ${item.name}`} onChange={setProduct}/></div>
        <select aria-label="Type de mouvement" value={type} onChange={e => setType(e.target.value)}><option value="">Tous les mouvements</option>{StockMovementTypes.map(item => <option key={item} value={item}>{statusText(item)}</option>)}</select>
        <FormField label="Du"><input type="date" value={from} onChange={e => setFrom(e.target.value)}/></FormField>
        <FormField label="Au"><input type="date" value={to} onChange={e => setTo(e.target.value)}/></FormField>
        {can("user:manage") && <select aria-label="Utilisateur" value={userId} onChange={e => setUserId(e.target.value)}><option value="">Tous les utilisateurs</option>{users.data?.items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
        {hasFilters && <button type="button" className="clear-filter-button" onClick={clearFilters}><RotateCcw size={15}/>Effacer</button>}
      </div>
      <DataTable title="Mouvements de stock" data={list.data} loading={list.isPending} error={list.error} columns={columns} page={list.page} onPage={list.setPage}/>
    </section>

    {creating && <MovementEditor onClose={() => setCreating(false)}/>} 
    {reason && <MovementReason {...reason} onClose={() => setReason(null)}/>} 
    {incidents && <IncidentList onClose={() => setIncidents(false)}/>} 
  </>;
}

function MovementEditor({onClose}:{onClose:()=>void}){const action=useAction();const{confirm}=useFeedback();const[product,setProduct]=useState<Product|null>(null);const[warehouseId,setWarehouseId]=useState("");const[type,setType]=useState("ENTRY");const[quantity,setQuantity]=useState("1");const[note,setNote]=useState("");const[direction,setDirection]=useState("IN");const warehouses=useQuery({queryKey:["/warehouses"],queryFn:()=>apiFetch<Warehouse[]>("/warehouses")});return <Modal open onClose={()=>{if(!action.busy)onClose();}} title="Nouveau mouvement" description="Vérifiez le produit et le dépôt avant confirmation."><form onSubmit={async e=>{e.preventDefault();if(!product)return;if(!await confirm(`Confirmer ${statusText(type).toLowerCase()} : ${quantity} ${product.unit} de ${product.name} ?`))return;const result=await action.run("/stock-movements",{productId:product.id,warehouseId,type,quantity:quantity.replace(",","."),direction:type==="ADJUSTMENT"?direction:undefined,note},{bodyKey:true});if(result)onClose();}}><div className="grid gap-4"><SearchSelect<Product> path="/products" label="Produit" value={product?.id??""} selectedLabel={product?.name} onChange={setProduct} display={p=>`${p.sku} - ${p.name}`} required/><FormField label="Dépôt *"><select required value={warehouseId} onChange={e=>setWarehouseId(e.target.value)}><option value="">Choisir un dépôt</option>{warehouses.data?.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></FormField><FormField label="Type"><select value={type} onChange={e=>setType(e.target.value)}>{StockMovementTypes.filter(t=>!["CUSTOMER_DELIVERY","CANCELLATION_REVERSAL"].includes(t)).map(t=><option key={t} value={t}>{statusText(t)}</option>)}</select></FormField>{type==="ADJUSTMENT"&&<FormField label="Sens de l'ajustement"><select value={direction} onChange={e=>setDirection(e.target.value)}><option value="IN">Ajouter au stock</option><option value="OUT">Retirer du stock</option></select></FormField>}<FormField label="Quantité *"><input required inputMode="decimal" value={quantity} onChange={e=>setQuantity(e.target.value)}/></FormField><FormField label="Motif"><textarea required={["ADJUSTMENT","DAMAGED"].includes(type)} minLength={5} maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}/></FormField></div><FormError error={action.error}/><div className="form-actions"><Button type="submit" disabled={action.busy||!product}>Confirmer le mouvement</Button></div></form></Modal>}
function MovementReason({movement,reverse,onClose}:{movement:StockMovement;reverse:boolean;onClose:()=>void}){const[reason,setReason]=useState("");const action=useAction();const{confirm}=useFeedback();return <Modal open onClose={()=>{if(!action.busy)onClose();}} title={reverse?"Inverser un mouvement":"Signaler une erreur"} description={`${movement.product.name} - ${quantity(movement.quantity)} ${movement.product.unit}`}><form onSubmit={async e=>{e.preventDefault();if(reverse&&!await confirm("Un nouveau mouvement compensera exactement celui-ci. Confirmer ?"))return;const result=await action.run(`/stock-movements/${movement.id}/${reverse?"reverse":"report"}`,reverse?{reason}:{description:reason},{bodyKey:true});if(result)onClose();}}><FormField label={reverse?"Motif de l'inversion *":"Décrivez l'erreur *"}><textarea required minLength={5} maxLength={1000} rows={4} value={reason} onChange={e=>setReason(e.target.value)}/></FormField><FormError error={action.error}/><div className="form-actions"><Button disabled={action.busy} variant={reverse?"danger":"primary"} type="submit">{reverse?"Créer le contre-mouvement":"Envoyer le signalement"}</Button></div></form></Modal>}
function IncidentList({onClose}:{onClose:()=>void}){const{can}=useAuth();const list=useList<Incident>("/stock-movements/incidents");const[resolve,setResolve]=useState<Incident|null>(null);const[resolution,setResolution]=useState("");const action=useAction();return <Modal open onClose={onClose} title="Signalements" description="Une résolution ne modifie pas le stock. Utilisez une inversion si une correction est nécessaire." wide><div className="toolbar"><select aria-label="Statut des signalements" value={list.status} onChange={e=>list.setStatus(e.target.value)}><option value="">Tous</option><option value="OPEN">À traiter</option><option value="RESOLVED">Résolus</option></select></div><DataTable data={list.data} loading={list.isPending} error={list.error} page={list.page} onPage={list.setPage} columns={[{header:"Date",cell:({row})=>date(row.original.createdAt)},{header:"Produit",cell:({row})=>row.original.movement.product.name},{header:"Description",accessorKey:"description"},{header:"Auteur",cell:({row})=>row.original.reportedBy?.name},{header:"Statut",cell:({row})=><StatusLabel status={row.original.status}/>},{header:"Résolution",cell:({row})=>row.original.status==="OPEN"&&can("stock:adjust")?<button className="quiet-button" onClick={()=>{setResolve(row.original);setResolution("");}}>Traiter</button>:row.original.resolution??"—"}]}/>{resolve&&<form className="mt-5 rounded-lg bg-slate-50 p-4" onSubmit={async e=>{e.preventDefault();if(await action.run(`/stock-movements/incidents/${resolve.id}/resolve`,{resolution})){setResolve(null);setResolution("");}}}><FormField label={`Résolution : ${resolve.movement.product.name}`}><textarea required minLength={5} maxLength={1000} value={resolution} onChange={e=>setResolution(e.target.value)}/></FormField><Button className="mt-3" type="submit" disabled={action.busy}>Marquer comme résolu</Button><FormError error={action.error}/></form>}</Modal>}
