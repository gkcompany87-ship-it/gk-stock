"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@as-tino/ui";
import { useAuth } from "../../providers/auth-provider";
import { AuthLayout } from "../../components/auth-layout";
import { FormField, FormError } from "../../components/form-field";
const schema = z.object({ email: z.string().email("Saisissez une adresse e-mail valide."), password: z.string().min(1,"Saisissez votre mot de passe.") });
export default function LoginPage() {
  const { login } = useAuth(); const router = useRouter(); const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  return <AuthLayout><span className="mb-4 block text-xs font-bold tracking-widest text-teal-700">BIENVENUE</span><h1>Connectez-vous</h1><p>Accédez à votre espace de travail sécurisé.</p><form method="post" action="/connexion" onSubmit={handleSubmit(async values => { setError(null); try { await login(values.email, values.password); router.replace("/"); } catch (e) { setError(e instanceof Error ? e.message : "Connexion impossible."); } })} noValidate><FormField label="Adresse e-mail" error={errors.email?.message}><input type="email" autoComplete="username" {...register("email")} aria-invalid={!!errors.email}/></FormField><FormField label="Mot de passe" error={errors.password?.message}><input type="password" autoComplete="current-password" {...register("password")} aria-invalid={!!errors.password}/></FormField><FormError error={error}/><Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Connexion..." : "Se connecter"}</Button><Link href="/mot-de-passe-oublie" className="text-center text-sm text-teal-700 underline">Mot de passe oublié ?</Link></form><div className="mt-12 text-center text-xs text-slate-400">G&K Stock · Développé par AS TINO DEV · Aucun compte public.</div></AuthLayout>;
}
