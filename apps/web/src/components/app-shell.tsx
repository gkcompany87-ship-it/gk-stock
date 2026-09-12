"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Archive, Boxes, ClipboardList, FileBarChart, LayoutDashboard, LogOut, Menu, Package, Receipt, ScanLine, Settings, Truck, Users, WalletCards, WifiOff, X } from "lucide-react";
import { Button } from "@as-tino/ui";
import { apiFetch } from "../lib/api";
import { useOnline } from "../lib/hooks";
import { useAuth } from "../providers/auth-provider";
import { useFeedback } from "../providers/feedback-provider";
import { LoadingState, ErrorState } from "./data-state";

const navItems = [
  { href: "/", label: "Tableau de bord", icon: LayoutDashboard, permission: "dashboard:read" },
  { href: "/scanner", label: "Scanner", icon: ScanLine, permission: "stock:withdraw" },
  { href: "/produits", label: "Produits", icon: Package, permission: "product:read" },
  { href: "/mouvements", label: "Mouvements", icon: Boxes, permission: "stock:read" },
  { href: "/clients", label: "Clients", icon: Users, permission: "customer:manage" },
  { href: "/devis", label: "Devis", icon: ClipboardList, permission: "document:manage" },
  { href: "/factures", label: "Factures", icon: Receipt, permission: "document:manage" },
  { href: "/bons-de-livraison", label: "Bons de livraison", icon: Truck, permission: "document:manage" },
  { href: "/paiements", label: "Paiements", icon: WalletCards, permission: "payment:manage" },
  { href: "/utilisateurs", label: "Utilisateurs", icon: Users, permission: "user:manage" },
  { href: "/rapports", label: "Rapports", icon: FileBarChart, permission: "report:read" },
  { href: "/journal-audit", label: "Journal d'audit", icon: Archive, permission: "audit:read" },
  { href: "/parametres", label: "Paramètres", icon: Settings, permission: "settings:manage" }
] as const;

const mobileQuickItems = [
  { href: "/", label: "Accueil", icon: LayoutDashboard, permission: "dashboard:read" },
  { href: "/produits", label: "Produits", icon: Package, permission: "product:read" },
  { href: "/scanner", label: "Scanner", icon: ScanLine, permission: "stock:withdraw", primary: true },
  { href: "/mouvements", label: "Stock", icon: Boxes, permission: "stock:read" }
] as const;

const publicRoutes = ["/connexion", "/mot-de-passe-oublie", "/reinitialiser-mot-de-passe"];
type CompanyPublic = { name: string; logoUrl?: string | null };

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, error, reload, can, logout } = useAuth();
  const { notify } = useFeedback();
  const online = useOnline();
  const t = useTranslations("app");
  const [menu, setMenu] = useState(false);
  const isPublic = publicRoutes.includes(pathname);
  const company = useQuery({ queryKey:["/settings/public","brand"], queryFn:()=>apiFetch<CompanyPublic>("/settings/public"), enabled:!!user && !isPublic, staleTime:300_000 });

  useEffect(() => { if (!loading && !user && !error && !isPublic) router.replace("/connexion"); }, [loading,user,error,isPublic,router]);
  useEffect(() => { setMenu(false); }, [pathname]);
  useEffect(() => { const previous=document.body.style.overflow; document.body.style.overflow = menu ? "hidden" : previous; return () => { document.body.style.overflow=previous; }; }, [menu]);
  useEffect(() => { if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") void navigator.serviceWorker.register("/sw.js").catch(() => undefined); }, []);
  if (isPublic) return <main id="main-content">{children}</main>;
  if (loading) return <div className="p-8"><LoadingState label="Ouverture de votre espace..."/></div>;
  if (error) return <div className="mx-auto max-w-lg p-8"><ErrorState message={error}/><Button className="mt-4" onClick={() => void reload()}>Réessayer</Button></div>;
  if (!user) return null;

  const section = navItems.find(item => item.href !== "/" && pathname.startsWith(item.href));
  const denied = section && (!can(section.permission) || (["document:manage","payment:manage","report:read"].includes(section.permission) && !can("financial:read")));
  const companyName = company.data?.name ?? "STE G&K DE COMMERCE";
  const logo = company.data?.logoUrl ?? "/company-logo.png";

  return <div className="app-shell"><a href="#main-content" className="skip-link">Aller au contenu principal</a>
    {menu && <button className="mobile-overlay" aria-label="Fermer le menu" onClick={() => setMenu(false)}/>} 
    <aside className={`sidebar ${menu ? "sidebar-open" : ""}`}><button type="button" className="sidebar-mobile-close" aria-label="Fermer le menu" onClick={()=>setMenu(false)}><X size={20}/></button>
      <Link href="/" className="brand client-brand"><Image src={logo} width={180} height={78} alt={companyName} className="client-logo" priority sizes="(max-width: 700px) 180px, 180px" unoptimized={logo.startsWith("/api/")}/></Link>
      <div className="nav-caption">ESPACE DE TRAVAIL</div>
      <nav aria-label="Navigation principale">{navItems.filter(item => can(item.permission) && (!["document:manage","payment:manage","report:read"].includes(item.permission) || can("financial:read"))).map(item => { const Icon=item.icon; return <Link key={item.href} href={item.href} aria-current={pathname===item.href?"page":undefined} className={`nav-link ${pathname===item.href?"active":""}`}><Icon size={18} aria-hidden/><span>{item.label}</span></Link>; })}</nav>
      <div className="sidebar-developer">Développé par <strong>AS TINO DEV</strong></div>
      <div className="sidebar-bottom"><span className="avatar">{user.name.slice(0,1).toUpperCase()}</span><div className="min-w-0"><strong>{user.name}</strong><small>{user.roles.join(" / ")}</small></div><button className="sidebar-logout" title={t("logout")} aria-label={t("logout")} onClick={() => void logout().catch(e => notify(e instanceof Error ? e.message : "Déconnexion impossible", true))}><span className="sidebar-logout-label">{t("logout")}</span><LogOut size={18}/></button></div>
    </aside>
    <div className="workspace"><header className="topbar"><div className="flex min-w-0 items-center gap-3"><button className="menu-toggle" aria-label={menu?"Fermer le menu":"Ouvrir le menu"} aria-expanded={menu} onClick={()=>setMenu(!menu)}>{menu?<X/>:<Menu/>}</button><span className="topbar-context truncate text-sm text-slate-500"><strong className="topbar-company text-slate-700">{companyName}</strong><span className="topbar-divider mx-2 text-slate-300">/</span><span className="topbar-section">{section?.label ?? "Vue d'ensemble"}</span></span></div><Link href="/scanner" className="quick-scan"><ScanLine size={17}/><span>Scanner</span></Link></header>
    {!online && <div className="offline-banner" role="status"><WifiOff size={18}/>{t("offline")}</div>}
    <main id="main-content" className="main-content">{denied?<section className="access-denied"><h1>{t("accessDenied")}</h1><p>{t("accessDescription")}</p><Link href="/" className="text-teal-700 underline">Retour au tableau de bord</Link></section>:children}</main>
    <nav className={`mobile-bottom-nav ${menu ? "menu-open" : ""}`} aria-label="Navigation mobile">{mobileQuickItems.filter(item => can(item.permission)).map(item => { const Icon = item.icon; const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href); return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`mobile-bottom-link ${active ? "active" : ""} ${"primary" in item && item.primary ? "primary" : ""}`}><span className="mobile-bottom-icon"><Icon size={20} aria-hidden/></span><span>{item.label}</span></Link>; })}<button type="button" className={`mobile-bottom-link ${menu ? "active" : ""}`} aria-label="Ouvrir le menu complet" aria-expanded={menu} onClick={() => setMenu(true)}><span className="mobile-bottom-icon"><Menu size={20} aria-hidden/></span><span>Menu</span></button></nav>
    <footer className="app-footer"><strong>{companyName}</strong><span>Développé par AS TINO DEV</span></footer></div>
  </div>;
}
