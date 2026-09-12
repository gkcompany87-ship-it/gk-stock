"use client";
import { useCallback, useEffect, useState } from "react";
import { Camera, CheckCircle2, TriangleAlert } from "lucide-react";
import { Button } from "@as-tino/ui";
import { apiFetch } from "../lib/api";
import type { ApiList, Product } from "../lib/types";
import { FormField } from "./form-field";
import { BarcodeScannerModal } from "./barcode-scanner-modal";

type Props={value:string;onChange:(value:string)=>void;currentProductId?:string;error?:string};
export function BarcodeProductField({value,onChange,currentProductId,error}:Props){
  const[scanner,setScanner]=useState(false);const[state,setState]=useState<"idle"|"checking"|"available"|"duplicate">("idle");const[duplicate,setDuplicate]=useState<Product|null>(null);
  const check=useCallback(async(raw:string)=>{const code=raw.trim();if(!code){setState("idle");setDuplicate(null);return;}setState("checking");try{const result=await apiFetch<ApiList<Product>>(`/products?search=${encodeURIComponent(code)}&pageSize=20`);const match=result.items.find(p=>p.barcode?.trim()===code&&p.id!==currentProductId)??null;setDuplicate(match);setState(match?"duplicate":"available");}catch{setState("idle");setDuplicate(null);}},[currentProductId]);
  useEffect(()=>{const id=window.setTimeout(()=>void check(value),450);return()=>window.clearTimeout(id);},[value,check]);
  return <FormField label="Code-barres / QR" error={error}><div className="barcode-field-row"><input value={value} onChange={e=>onChange(e.target.value)} onBlur={()=>void check(value)} autoComplete="off" autoCapitalize="off" placeholder="Scanner ou saisir le code" aria-invalid={!!error||state==="duplicate"}/><Button type="button" variant="secondary" onClick={()=>setScanner(true)}><Camera size={17}/>Scanner</Button></div>{state==="checking"&&<p className="field-hint">Vérification du code...</p>}{state==="available"&&<p className="field-ok"><CheckCircle2 size={14}/>Code disponible</p>}{state==="duplicate"&&duplicate&&<p className="field-warning"><TriangleAlert size={14}/>Déjà utilisé par <strong>{duplicate.name}</strong> ({duplicate.sku}).</p>}<p className="field-hint">Caméra, douchette USB/Bluetooth ou saisie manuelle.</p><BarcodeScannerModal open={scanner} onClose={()=>setScanner(false)} onDetected={code=>{onChange(code);void check(code);}}/></FormField>;
}
