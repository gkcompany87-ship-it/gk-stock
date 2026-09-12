"use client";
import { useState } from "react";
import { apiFetch } from "../lib/api";
import { useFeedback } from "../providers/feedback-provider";
import { FormField } from "./form-field";
export function ImageUpload({ onUpload, label = "Image du produit (PNG, JPEG ou WebP, 2 Mo max.)" }: { onUpload: (id: string) => void; label?: string }) {
  const [busy,setBusy]=useState(false); const {notify}=useFeedback();
  return <FormField label={label}><input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={async e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>2*1024*1024){notify("Image limitée à 2 Mo.",true);return;}setBusy(true);try{const body=new FormData();body.append("file",file);const asset=await apiFetch<{id:string}>("/files/images",{method:"POST",body});onUpload(asset.id);notify("Image importée.");}catch(err){notify(err instanceof Error?err.message:"Import impossible.",true);}finally{setBusy(false);}}}/>{busy&&<span className="text-xs text-slate-500" role="status">Validation et import...</span>}</FormField>;
}
