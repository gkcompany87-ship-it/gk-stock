"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { KeyRound, Search, ShieldCheck, UserCheck, UserPlus, Users, UserX } from "lucide-react";
import { Button } from "@as-tino/ui";
import { Permissions } from "@as-tino/shared";
import { apiFetch } from "../../lib/api";
import { useList, useAction } from "../../lib/hooks";
import type { ManagedUser, ManagedUserList, Role } from "../../lib/types";
import { date } from "../../lib/format";
import { useAuth } from "../../providers/auth-provider";
import { useFeedback } from "../../providers/feedback-provider";
import { PageHeader } from "../../components/page-header";
import { DataTable } from "../../components/data-table";
import { Modal } from "../../components/modal";
import { FormField, FormError } from "../../components/form-field";
import { StatusLabel } from "../../components/status-label";

const permissionLabels: Record<string, string> = {
  "dashboard:read": "Tableau de bord",
  "product:read": "Lire les produits",
  "product:write": "Gérer les produits et les prix",
  "stock:read": "Lire ses mouvements",
  "stock:read-all": "Lire tous les mouvements",
  "stock:report-mistake": "Signaler une erreur",
  "stock:adjust": "Ajuster et inverser le stock",
  "stock:withdraw": "Retirer du stock",
  "user:manage": "Gérer les utilisateurs et rôles",
  "customer:manage": "Gérer les clients",
  "document:manage": "Gérer les documents",
  "payment:manage": "Gérer les paiements",
  "financial:read": "Accéder aux données financières",
  "report:read": "Rapports et exports",
  "audit:read": "Lire le journal d'audit",
  "settings:manage": "Gérer les paramètres"
};

export default function UsersPage() {
  const list = useList<ManagedUser>("/users");
  const roles = useQuery({ queryKey: ["/roles"], queryFn: () => apiFetch<Role[]>("/roles") });
  const [editor, setEditor] = useState<ManagedUser | "new" | null>(null);
  const [passwordUser, setPasswordUser] = useState<ManagedUser | null>(null);
  const [roleEditor, setRoleEditor] = useState(false);
  const action = useAction();
  const { confirm } = useFeedback();
  const { user } = useAuth();
  const response = list.data as ManagedUserList | undefined;
  const summary = response?.summary ?? {
    total: response?.total ?? 0,
    active: response?.items.filter(item => item.status === "ACTIVE").length ?? 0,
    inactive: response?.items.filter(item => item.status === "INACTIVE").length ?? 0
  };

  const revokeSessions = async (managed: ManagedUser) => {
    if (!await confirm(`Déconnecter ${managed.name} de tous ses appareils ?`)) return;
    await action.run(`/users/${managed.id}/logout-all`, undefined, { message: "Toutes les sessions ont été révoquées." });
  };

  const toggleStatus = async (managed: ManagedUser) => {
    const disabling = managed.status === "ACTIVE";
    if (!await confirm(`${disabling ? "Désactiver" : "Réactiver"} le compte de ${managed.name} ?${disabling ? " Ses sessions actives seront immédiatement fermées." : ""}`)) return;
    await action.run(`/users/${managed.id}`, { status: disabling ? "INACTIVE" : "ACTIVE" }, { method: "PATCH", message: disabling ? "Compte désactivé." : "Compte réactivé." });
  };

  const columns: ColumnDef<ManagedUser>[] = [
    {
      header: "Utilisateur",
      cell: ({ row }) => <div className="user-identity"><span className="user-avatar-mini">{row.original.name.slice(0, 1).toUpperCase()}</span><div><strong>{row.original.name}</strong><p>{row.original.email}</p></div></div>
    },
    {
      header: "Rôles",
      cell: ({ row }) => <div className="role-chip-list">{row.original.roles.map(item => <span className="role-chip" key={item.role.code}>{item.role.name}</span>)}</div>
    },
    { header: "Statut", cell: ({ row }) => <StatusLabel status={row.original.status}/> },
    {
      header: "Dernière connexion",
      cell: ({ row }) => <div><strong className="text-xs">{row.original.lastLoginAt ? date(row.original.lastLoginAt, true) : "Jamais"}</strong>{row.original.createdAt && <p className="text-[10px] text-slate-400">Créé le {date(row.original.createdAt)}</p>}</div>
    },
    {
      header: "Actions",
      cell: ({ row }) => {
        const managed = row.original;
        const self = managed.id === user?.id;
        return <div className="user-row-actions">
          <button className="quiet-button" onClick={() => setEditor(managed)}>Modifier</button>
          {!self && <button className="quiet-button" onClick={() => setPasswordUser(managed)}>Mot de passe</button>}
          {!self && managed.status === "ACTIVE" && <button className="quiet-button" disabled={action.busy} onClick={() => void revokeSessions(managed)}>Déconnecter</button>}
          {!self && <button className={`quiet-button ${managed.status === "ACTIVE" ? "danger" : ""}`} disabled={action.busy} onClick={() => void toggleStatus(managed)}>{managed.status === "ACTIVE" ? "Désactiver" : "Réactiver"}</button>}
        </div>;
      }
    }
  ];

  return <>
    <PageHeader
      title="Gestion des comptes"
      description="Créez les accès des employés, attribuez les rôles et coupez immédiatement un compte en cas de besoin."
      action={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setRoleEditor(true)}><ShieldCheck size={16}/>Rôles et permissions</Button><Button onClick={() => setEditor("new")}><UserPlus size={16}/>Ajouter un utilisateur</Button></div>}
    />

    <section className="account-summary-grid" aria-label="Résumé des comptes">
      <article className="account-summary-card"><span className="account-summary-icon"><Users size={18}/></span><div><small>Comptes au total</small><strong>{summary.total}</strong><p>Tous les accès de l'entreprise</p></div></article>
      <article className="account-summary-card success"><span className="account-summary-icon"><UserCheck size={18}/></span><div><small>Comptes actifs</small><strong>{summary.active}</strong><p>Peuvent actuellement se connecter</p></div></article>
      <article className="account-summary-card muted"><span className="account-summary-icon"><UserX size={18}/></span><div><small>Désactivés</small><strong>{summary.inactive}</strong><p>Accès bloqués et sessions fermées</p></div></article>
    </section>

    <section className="management-panel">
      <div className="management-toolbar">
        <div className="management-search"><Search size={16}/><input aria-label="Rechercher un utilisateur" placeholder="Rechercher par nom ou e-mail..." value={list.search} onChange={e => list.setSearch(e.target.value)}/></div>
        <select aria-label="Filtrer par statut" value={list.status} onChange={e => list.setStatus(e.target.value)}><option value="">Tous les statuts</option><option value="ACTIVE">Actifs</option><option value="INACTIVE">Désactivés</option></select>
      </div>
      <DataTable title="Comptes utilisateurs" columns={columns} data={list.data} error={list.error} loading={list.isPending} page={list.page} onPage={list.setPage}/>
    </section>

    {editor && <UserEditor user={editor === "new" ? undefined : editor} roles={roles.data ?? []} onClose={() => setEditor(null)}/>} 
    {passwordUser && <ResetPasswordEditor user={passwordUser} onClose={() => setPasswordUser(null)}/>} 
    {roleEditor && <RoleEditor roles={roles.data ?? []} onClose={() => setRoleEditor(false)}/>} 
  </>;
}

function UserEditor({ user, roles, onClose }: { user?: ManagedUser; roles: Role[]; onClose: () => void }) {
  const action = useAction();
  const { confirm } = useFeedback();
  const { register, handleSubmit } = useForm<{ name: string; email: string; password: string }>({ defaultValues: { name: user?.name ?? "", email: user?.email ?? "", password: "" } });
  const [selected, setSelected] = useState<string[]>(user?.roles.map(item => item.role.code) ?? ["WORKER"]);
  return <Modal open onClose={() => { if (!action.busy) onClose(); }} title={user ? "Modifier le compte" : "Créer un compte employé"} description={user ? "Une modification de l'e-mail ou des rôles ferme les sessions de cet utilisateur." : "Créez un accès nominatif. Le rôle Worker est sélectionné par défaut."}>
    <form onSubmit={handleSubmit(async input => {
      if (user && !await confirm("Enregistrer les nouveaux accès de cet utilisateur ?")) return;
      const body = { name: input.name, email: input.email, roleCodes: selected, ...(!user ? { password: input.password } : {}) };
      if (await action.run(user ? `/users/${user.id}` : "/users", body, { method: user ? "PATCH" : "POST", message: user ? "Compte mis à jour." : "Compte créé." })) onClose();
    })}>
      <div className="grid gap-4">
        <FormField label="Nom complet *"><input required minLength={2} maxLength={120} {...register("name")}/></FormField>
        <FormField label="Adresse e-mail *"><input required type="email" autoComplete="off" {...register("email")}/></FormField>
        {!user && <FormField label="Mot de passe initial (12 caractères minimum) *"><input required type="password" autoComplete="new-password" minLength={12} maxLength={128} {...register("password")}/></FormField>}
        <fieldset><legend className="field-label">Rôles *</legend><div className="grid gap-3 rounded-xl border border-slate-200 p-4">{roles.map(role => <label className="checkbox-label" key={role.id}><input type="checkbox" checked={selected.includes(role.code)} onChange={e => setSelected(current => e.target.checked ? [...current, role.code] : current.filter(code => code !== role.code))}/><span><strong className="block">{role.name}</strong><small className="text-slate-500">{role.code === "WORKER" ? "Accès opérationnel au stock et au scanner selon les permissions définies." : role.code === "ADMIN" ? "Accès d'administration complet selon les permissions du rôle." : role.code}</small></span></label>)}</div></fieldset>
      </div>
      <FormError error={action.error}/>
      <div className="form-actions"><Button type="button" variant="secondary" onClick={onClose} disabled={action.busy}>Annuler</Button><Button type="submit" disabled={action.busy || !selected.length}>Enregistrer les accès</Button></div>
    </form>
  </Modal>;
}

function ResetPasswordEditor({ user, onClose }: { user: ManagedUser; onClose: () => void }) {
  const action = useAction();
  const { confirm } = useFeedback();
  const { register, handleSubmit, watch, formState: { errors } } = useForm<{ password: string; confirmation: string }>({ defaultValues: { password: "", confirmation: "" } });
  const password = watch("password");
  return <Modal open onClose={() => { if (!action.busy) onClose(); }} title="Réinitialiser le mot de passe" description={`Compte : ${user.name} · ${user.email}`}>
    <div className="security-notice"><KeyRound size={18}/><div><strong>Nouveau mot de passe temporaire</strong><p>Toutes les sessions de ce compte seront fermées après la modification.</p></div></div>
    <form onSubmit={handleSubmit(async input => {
      if (input.password !== input.confirmation) return;
      if (!await confirm(`Changer le mot de passe de ${user.name} et déconnecter tous ses appareils ?`)) return;
      if (await action.run(`/users/${user.id}/reset-password`, { password: input.password }, { message: "Mot de passe modifié et sessions révoquées." })) onClose();
    })}>
      <div className="grid gap-4 mt-5">
        <FormField label="Nouveau mot de passe *" error={errors.password?.message}><input required type="password" autoComplete="new-password" minLength={12} maxLength={128} {...register("password", { minLength: { value: 12, message: "12 caractères minimum." } })}/></FormField>
        <FormField label="Confirmer le mot de passe *" error={errors.confirmation?.message}><input required type="password" autoComplete="new-password" {...register("confirmation", { validate: value => value === password || "Les mots de passe ne correspondent pas." })}/></FormField>
      </div>
      <FormError error={action.error}/>
      <div className="form-actions"><Button type="button" variant="secondary" onClick={onClose} disabled={action.busy}>Annuler</Button><Button type="submit" disabled={action.busy}><KeyRound size={16}/>Changer le mot de passe</Button></div>
    </form>
  </Modal>;
}

function RoleEditor({ roles, onClose }: { roles: Role[]; onClose: () => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const action = useAction();
  const { confirm } = useFeedback();
  const locked = ["ADMIN", "WORKER"].includes(code);
  return <Modal open wide onClose={onClose} title="Rôles et permissions" description="Les rôles Admin et Worker sont protégés. Créez un rôle personnalisé pour un besoin particulier.">
    <FormField label="Choisir un rôle existant"><select value={roles.some(role => role.code === code) ? code : ""} onChange={e => { const role = roles.find(item => item.code === e.target.value); setCode(role?.code ?? ""); setName(role?.name ?? ""); setPermissions(role?.permissions.map(item => item.permission.code) ?? []); }}><option value="">Nouveau rôle personnalisé</option>{roles.map(role => <option key={role.id} value={role.code}>{role.name}</option>)}</select></FormField>
    <form className="mt-5" onSubmit={async e => { e.preventDefault(); if (!await confirm("Enregistrer les permissions de ce rôle ?")) return; await action.run("/roles", { code, name, permissions }); }}>
      <div className="form-grid"><FormField label="Code du rôle"><input required pattern="[A-Z][A-Z0-9_]{1,39}" disabled={locked} value={code} onChange={e => setCode(e.target.value.toUpperCase())}/></FormField><FormField label="Nom affiché"><input required minLength={2} maxLength={80} disabled={locked} value={name} onChange={e => setName(e.target.value)}/></FormField></div>
      <fieldset className="my-5"><legend className="field-label mb-3">Permissions</legend><div className="grid gap-3 sm:grid-cols-2">{Object.values(Permissions).map(permission => <label key={permission} className="checkbox-label rounded-lg bg-slate-50 p-3"><input type="checkbox" disabled={locked} checked={permissions.includes(permission)} onChange={e => setPermissions(current => e.target.checked ? [...current, permission] : current.filter(item => item !== permission))}/><span>{permissionLabels[permission] ?? permission}<small className="block text-[10px] text-slate-400">{permission}</small></span></label>)}</div></fieldset>
      <FormError error={action.error}/><div className="form-actions"><Button type="button" variant="secondary" onClick={onClose}>Fermer</Button><Button type="submit" disabled={locked || action.busy}>Enregistrer le rôle</Button></div>
    </form>
  </Modal>;
}
