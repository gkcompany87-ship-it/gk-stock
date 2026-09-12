"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@as-tino/ui";
import { apiFetch } from "../../lib/api";
import { AuthLayout } from "../../components/auth-layout";
import { FormField, FormError } from "../../components/form-field";
export default function ForgotPassword() {
  const [email,setEmail]=useState("");const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");const [error,setError]=useState("");
  return <AuthLayout><h1>Rétablir l'accès</h1><p>Un lien à usage unique vous sera envoyé si le compte existe.</p><form onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setError("");try{const result=await apiFetch<{message:string}>("/auth/password-reset",{method:"POST",json:{email},noRefresh:true});setMessage(result.message);}catch(err){setError(err instanceof Error?err.message:"Envoi impossible.");}finally{setBusy(false);}}}><FormField label="Adresse e-mail"><input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></FormField><FormError error={error}/>{message&&<p role="status" className="rounded-lg bg-teal-50 p-3 text-teal-800">{message}</p>}<Button disabled={busy} type="submit">Envoyer le lien</Button><Link href="/connexion" className="text-sm text-teal-700 underline">Retour à la connexion</Link></form></AuthLayout>;
}
