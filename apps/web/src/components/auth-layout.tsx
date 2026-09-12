import Image from "next/image";
import type { ReactNode } from "react";

export function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="auth-page">
    <aside className="auth-aside">
      <div className="client-brand client-brand-auth">
        <Image src="/company-logo.png" width={220} height={110} alt="STE G&K DE COMMERCE" priority className="client-logo-auth"/>
      </div>
      <div><span className="mb-6 block text-xs font-semibold tracking-[.25em] text-cyan-200">GESTION DE STOCK & COMMERCIAL</span><h1>Votre stock.<br/>Votre activité.<br/><span className="text-cyan-200">Sous contrôle.</span></h1><p>Du premier scan au dernier règlement, retrouvez la gestion de STE G&K DE COMMERCE dans un seul espace sécurisé.</p></div>
      <small className="text-slate-300">Solution développée par AS TINO DEV · Tunisie</small>
    </aside>
    <section className="auth-main"><div className="auth-card">{children}</div></section>
  </div>;
}
