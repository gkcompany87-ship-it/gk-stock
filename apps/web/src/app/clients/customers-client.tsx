"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@as-tino/ui";
import { Plus } from "lucide-react";
import { apiFetch, queryString } from "../../lib/api";
import { useList, useAction } from "../../lib/hooks";
import { customerName, money, date } from "../../lib/format";
import type {
  Customer,
  ApiList,
  CustomerFinancialDetails,
  CustomerFinancialStatus
} from "../../lib/types";
import { useAuth } from "../../providers/auth-provider";
import { useFeedback } from "../../providers/feedback-provider";
import { PageHeader } from "../../components/page-header";
import { DataTable } from "../../components/data-table";
import { Modal } from "../../components/modal";
import { FormField, FormError } from "../../components/form-field";
import { StatusLabel } from "../../components/status-label";

const schema = z
  .object({
    type: z.enum(["COMPANY", "INDIVIDUAL"]),
    companyName: z.string().max(250),
    contactName: z.string().min(2).max(200),
    taxIdentificationNumber: z.string().max(250),
    email: z.union([z.literal(""), z.string().email()]),
    phone: z.string().max(50),
    billingAddress: z.string().max(2000),
    deliveryAddress: z.string().max(2000),
    notes: z.string().max(4000)
  })
  .refine(v => v.type !== "COMPANY" || !!v.companyName.trim(), {
    message: "La raison sociale est requise.",
    path: ["companyName"]
  });

const adjustmentSchema = z.object({
  direction: z.enum(["CUSTOMER_OWES_US", "WE_OWE_CUSTOMER"]),
  amount: z
    .string()
    .trim()
    .regex(/^\d{1,11}(?:[.,]\d{1,3})?$/, "Montant invalide (3 décimales maximum).")
    .refine(value => Number(value.replace(",", ".")) > 0, "Le montant doit être supérieur à zéro."),
  reason: z.string().trim().min(3, "Indiquez un motif.").max(1000),
  effectiveDate: z.string()
});

type Values = z.infer<typeof schema>;
type AdjustmentValues = z.infer<typeof adjustmentSchema>;

const situationLabels: Record<CustomerFinancialStatus, string> = {
  UP_TO_DATE: "À jour",
  PENDING: "En attente",
  OVERDUE: "Impayé",
  CREDIT: "Crédit client"
};

function SituationBadge({ status }: { status: CustomerFinancialStatus }) {
  const classes =
    status === "UP_TO_DATE"
      ? "bg-emerald-50 text-emerald-700"
      : status === "OVERDUE"
        ? "bg-red-50 text-red-700"
        : status === "CREDIT"
          ? "bg-teal-50 text-teal-700"
          : "bg-amber-50 text-amber-700";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${classes}`}>{situationLabels[status]}</span>;
}

export function CustomersClient() {
  const list = useList<Customer>("/customers");
  const [editor, setEditor] = useState<Customer | "new" | null>(null);
  const [timeline, setTimeline] = useState<Customer | null>(null);
  const [account, setAccount] = useState<Customer | null>(null);
  const action = useAction();
  const { confirm } = useFeedback();
  const { can } = useAuth();

  const columns: ColumnDef<Customer>[] = [
    {
      header: "Client",
      cell: ({ row }) => (
        <div>
          <strong className="block">{customerName(row.original)}</strong>
          <span className="text-xs text-slate-500">{row.original.type === "COMPANY" ? "Entreprise" : "Particulier"}</span>
        </div>
      )
    },
    { header: "Contact", accessorKey: "contactName" },
    {
      header: "Coordonnées",
      cell: ({ row }) => (
        <div>
          <span className="block">{row.original.email || "—"}</span>
          <span className="text-xs text-slate-500">{row.original.phone}</span>
        </div>
      )
    },
    { header: "Matricule fiscal", cell: ({ row }) => row.original.taxIdentificationNumber || "—" }
  ];

  if (can("financial:read")) {
    columns.push({
      header: "Compte client",
      cell: ({ row }) => {
        const financial = row.original.financial;
        if (!financial) return "—";
        return (
          <button className="text-left" onClick={() => setAccount(row.original)}>
            <strong className="block text-slate-900">{money(financial.balance)}</strong>
            <span className="mt-1 block">
              <SituationBadge status={financial.status} />
            </span>
            {financial.unpaidCount > 0 && (
              <span className="mt-1 block text-xs text-slate-500">
                {financial.unpaidCount} facture{financial.unpaidCount > 1 ? "s" : ""} ouverte{financial.unpaidCount > 1 ? "s" : ""}
              </span>
            )}
          </button>
        );
      }
    });
  }

  columns.push({
    header: "Actions",
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-2">
        <button className="quiet-button" onClick={() => setEditor(row.original)}>
          Modifier
        </button>
        {can("financial:read") && (
          <button className="quiet-button" onClick={() => setAccount(row.original)}>
            Compte
          </button>
        )}
        {can("financial:read") && (
          <button className="quiet-button" onClick={() => setTimeline(row.original)}>
            Historique
          </button>
        )}
        {row.original.active && (
          <button
            className="quiet-button danger"
            disabled={action.busy}
            onClick={async () => {
              if (await confirm(`Archiver ${customerName(row.original)} ? Les documents restent conservés.`)) {
                await action.run(`/customers/${row.original.id}/archive`, undefined, { method: "PATCH" });
              }
            }}
          >
            Archiver
          </button>
        )}
      </div>
    )
  });

  return (
    <>
      <PageHeader
        title="Clients"
        description="Coordonnées, situation financière et historique commercial de chaque client."
        action={
          <Button onClick={() => setEditor("new")}>
            <Plus size={16} />
            Nouveau client
          </Button>
        }
      />

      <div className="toolbar">
        <input
          aria-label="Rechercher un client"
          placeholder="Nom, entreprise, e-mail..."
          value={list.search}
          onChange={e => list.setSearch(e.target.value)}
        />
        <select aria-label="Statut du client" value={list.status} onChange={e => list.setStatus(e.target.value)}>
          <option value="">Clients actifs</option>
          <option value="ARCHIVED">Clients archivés</option>
        </select>
      </div>

      <DataTable
        title="Clients"
        data={list.data}
        loading={list.isPending}
        error={list.error}
        columns={columns}
        page={list.page}
        onPage={list.setPage}
      />

      {editor && <CustomerEditor customer={editor === "new" ? undefined : editor} onClose={() => setEditor(null)} />}
      {timeline && <CustomerTimeline customer={timeline} onClose={() => setTimeline(null)} />}
      {account && <CustomerAccount customer={account} onClose={() => setAccount(null)} />}
    </>
  );
}

function CustomerEditor({ customer, onClose }: { customer?: Customer; onClose: () => void }) {
  const action = useAction();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors }
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: customer?.type ?? "COMPANY",
      companyName: customer?.companyName ?? "",
      contactName: customer?.contactName ?? "",
      taxIdentificationNumber: customer?.taxIdentificationNumber ?? "",
      email: customer?.email ?? "",
      phone: customer?.phone ?? "",
      billingAddress: customer?.addresses?.find(a => a.kind === "BILLING")?.rawText ?? "",
      deliveryAddress: customer?.addresses?.find(a => a.kind === "DELIVERY")?.rawText ?? "",
      notes: customer?.notes ?? ""
    }
  });

  return (
    <Modal
      open
      onClose={() => {
        if (!action.busy) onClose();
      }}
      title={customer ? "Modifier le client" : "Nouveau client"}
      description="Les documents émis conservent les coordonnées au jour de l'émission."
    >
      <form
        onSubmit={handleSubmit(async values => {
          const result = await action.run<Customer>(
            customer ? `/customers/${customer.id}` : "/customers",
            { ...values, email: values.email || undefined },
            { method: customer ? "PATCH" : "POST" }
          );
          if (result) onClose();
        })}
      >
        <div className="form-grid">
          <FormField label="Type de client">
            <select {...register("type")}>
              <option value="COMPANY">Entreprise</option>
              <option value="INDIVIDUAL">Particulier</option>
            </select>
          </FormField>

          <FormField label={watch("type") === "COMPANY" ? "Raison sociale *" : "Raison sociale"} error={errors.companyName?.message}>
            <input {...register("companyName")} />
          </FormField>

          {(
            [
              ["contactName", "Nom du contact *"],
              ["taxIdentificationNumber", "Matricule fiscal"],
              ["email", "E-mail"],
              ["phone", "Téléphone"]
            ] as const
          ).map(([key, label]) => (
            <FormField key={key} label={label} error={errors[key]?.message}>
              <input type={key === "email" ? "email" : "text"} {...register(key)} aria-invalid={!!errors[key]} />
            </FormField>
          ))}

          <FormField label="Adresse de facturation">
            <textarea rows={3} {...register("billingAddress")} />
          </FormField>
          <FormField label="Adresse de livraison">
            <textarea rows={3} {...register("deliveryAddress")} />
          </FormField>
          <FormField label="Notes internes" className="full">
            <textarea rows={3} {...register("notes")} />
          </FormField>
        </div>

        <FormError error={action.error} />
        <div className="form-actions">
          <Button variant="secondary" type="button" onClick={onClose} disabled={action.busy}>
            Annuler
          </Button>
          <Button disabled={action.busy} type="submit">
            Enregistrer le client
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CustomerAccount({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const { can } = useAuth();
  const [adjusting, setAdjusting] = useState(false);
  const query = useQuery({
    queryKey: ["/customers", customer.id, "financial"],
    queryFn: () => apiFetch<CustomerFinancialDetails>(`/customers/${customer.id}/financial`)
  });

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={`Compte client — ${customerName(customer)}`}
      description="Factures, règlements et ajustements manuels réunis dans une seule situation."
    >
      {query.isPending ? (
        <div className="py-12 text-center text-sm text-slate-500">Chargement du compte client…</div>
      ) : query.error ? (
        <FormError error={query.error.message} />
      ) : query.data ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <SituationBadge status={query.data.status} />
              <p className="mt-2 text-xs text-slate-500">
                Solde positif = montant à recevoir. Solde négatif = crédit en faveur du client.
              </p>
            </div>
            {can("payment:manage") && (
              <Button onClick={() => setAdjusting(true)}>
                <Plus size={16} />
                Ajouter un ajustement
              </Button>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <FinancialCard
              label={Number(query.data.balance) < 0 ? "Crédit client" : "Solde à recevoir"}
              value={money(query.data.balance)}
              helper={query.data.status === "UP_TO_DATE" ? "Compte à jour" : `${query.data.unpaidCount} facture(s) ouverte(s)`}
            />
            <FinancialCard label="Total facturé" value={money(query.data.totalInvoiced)} helper="Factures émises, hors brouillons/annulations" />
            <FinancialCard label="Total payé" value={money(query.data.totalPaid)} helper={query.data.lastPaymentAt ? `Dernier paiement : ${date(query.data.lastPaymentAt)}` : "Aucun paiement enregistré"} />
            <FinancialCard label="En retard" value={money(query.data.overdueAmount)} helper="Factures arrivées à échéance" />
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <strong>Ajustements manuels : {money(query.data.adjustmentsNet)}</strong>
            <p className="mt-1 text-xs text-slate-500">
              Pour une facture existante, utilisez le module Paiements. Les ajustements servent aux anciennes dettes, avoirs ou corrections hors facture.
            </p>
          </div>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Factures ouvertes</h3>
              <span className="text-xs text-slate-500">{query.data.openInvoices.length} facture(s)</span>
            </div>
            {query.data.openInvoices.length ? (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table>
                  <thead>
                    <tr>
                      <th>Facture</th>
                      <th>Échéance</th>
                      <th>Total</th>
                      <th>Payé</th>
                      <th>Reste</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {query.data.openInvoices.map(invoice => (
                      <tr key={invoice.id}>
                        <td className="font-bold">{invoice.number ?? invoice.internalRef}</td>
                        <td>{date(invoice.dueDate)}</td>
                        <td>{money(invoice.total)}</td>
                        <td>{money(invoice.paidAmount)}</td>
                        <td className="font-bold">{money(invoice.remainingAmount)}</td>
                        <td>
                          <StatusLabel status={invoice.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyFinancialState text="Aucune facture impayée." />
            )}
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <section>
              <h3 className="mb-3 font-bold text-slate-900">Derniers paiements</h3>
              {query.data.recentPayments.length ? (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Facture</th>
                        <th>Mode</th>
                        <th>Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {query.data.recentPayments.map(payment => (
                        <tr key={payment.id}>
                          <td>{date(payment.paidAt)}</td>
                          <td>{payment.invoice.number ?? payment.invoice.internalRef}</td>
                          <td>
                            <StatusLabel status={payment.method} />
                          </td>
                          <td className="font-bold">{money(payment.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyFinancialState text="Aucun paiement enregistré." />
              )}
            </section>

            <section>
              <h3 className="mb-3 font-bold text-slate-900">Ajustements manuels</h3>
              {query.data.adjustments.length ? (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Motif</th>
                        <th>Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {query.data.adjustments.map(adjustment => (
                        <tr key={adjustment.id}>
                          <td>{date(adjustment.effectiveAt)}</td>
                          <td>
                            <StatusLabel status={adjustment.direction} />
                          </td>
                          <td>
                            <span className="block">{adjustment.reason}</span>
                            {adjustment.createdBy?.name && (
                              <span className="text-xs text-slate-500">par {adjustment.createdBy.name}</span>
                            )}
                          </td>
                          <td className="font-bold">
                            {adjustment.direction === "WE_OWE_CUSTOMER" ? "−" : "+"}
                            {money(adjustment.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyFinancialState text="Aucun ajustement manuel." />
              )}
            </section>
          </div>

          {adjusting && (
            <AdjustmentEditor
              customer={customer}
              onClose={() => setAdjusting(false)}
            />
          )}
        </div>
      ) : null}
    </Modal>
  );
}

function FinancialCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <strong className="mt-2 block text-2xl text-slate-900">{value}</strong>
      <p className="mt-2 text-xs text-slate-500">{helper}</p>
    </div>
  );
}

function EmptyFinancialState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">{text}</div>;
}

function AdjustmentEditor({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const action = useAction();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors }
  } = useForm<AdjustmentValues>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: {
      direction: "CUSTOMER_OWES_US",
      amount: "",
      reason: "",
      effectiveDate: new Date().toISOString().slice(0, 10)
    }
  });

  const direction = watch("direction");

  return (
    <Modal
      open
      onClose={() => {
        if (!action.busy) onClose();
      }}
      title="Ajustement du compte client"
      description={customerName(customer)}
    >
      <form
        onSubmit={handleSubmit(async values => {
          const result = await action.run(
            `/customers/${customer.id}/adjustments`,
            {
              direction: values.direction,
              amount: values.amount.replace(",", "."),
              reason: values.reason,
              effectiveAt: values.effectiveDate ? `${values.effectiveDate}T12:00:00+01:00` : undefined
            },
            {
              bodyKey: true,
              message: "Ajustement du compte client enregistré."
            }
          );
          if (result) onClose();
        })}
      >
        <div className="space-y-4">
          <FormField label="Type d'ajustement">
            <select {...register("direction")}>
              <option value="CUSTOMER_OWES_US">Le client nous doit</option>
              <option value="WE_OWE_CUSTOMER">Nous devons au client / crédit client</option>
            </select>
          </FormField>

          <div className={`rounded-lg p-3 text-sm ${direction === "CUSTOMER_OWES_US" ? "bg-amber-50 text-amber-900" : "bg-teal-50 text-teal-900"}`}>
            {direction === "CUSTOMER_OWES_US"
              ? "Ce montant augmentera le solde à recevoir du client."
              : "Ce montant diminuera le solde du client et peut créer un crédit en sa faveur."}
          </div>

          <FormField label="Montant (TND) *" error={errors.amount?.message}>
            <input inputMode="decimal" placeholder="0,000" {...register("amount")} aria-invalid={!!errors.amount} />
          </FormField>

          <FormField label="Date *" error={errors.effectiveDate?.message}>
            <input type="date" {...register("effectiveDate")} />
          </FormField>

          <FormField label="Motif *" error={errors.reason?.message}>
            <textarea
              rows={3}
              placeholder="Ex. ancienne dette avant mise en place du système"
              {...register("reason")}
              aria-invalid={!!errors.reason}
            />
          </FormField>
        </div>

        <FormError error={action.error} />
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onClose} disabled={action.busy}>
            Annuler
          </Button>
          <Button type="submit" disabled={action.busy}>
            {action.busy ? "Enregistrement..." : "Enregistrer l'ajustement"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

type Event = {
  id: string;
  type: string;
  number: string;
  date: string;
  amount: string;
  status: string;
};

function CustomerTimeline({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["/customers", customer.id, "timeline", page],
    queryFn: () => apiFetch<ApiList<Event>>(`/customers/${customer.id}/timeline${queryString({ page })}`)
  });

  const labels: Record<string, string> = {
    QUOTE: "Devis",
    INVOICE: "Facture",
    DELIVERY_NOTE: "Bon de livraison",
    PAYMENT: "Paiement",
    ADJUSTMENT: "Ajustement"
  };

  return (
    <Modal open onClose={onClose} title={customerName(customer)} description="Devis, factures, livraisons, règlements et ajustements." wide>
      <DataTable
        data={query.data}
        loading={query.isPending}
        error={query.error}
        page={page}
        onPage={setPage}
        title="Historique du client"
        columns={[
          { header: "Date", cell: ({ row }) => date(row.original.date) },
          { header: "Type", cell: ({ row }) => labels[row.original.type] ?? row.original.type },
          { header: "Référence", accessorKey: "number" },
          { header: "Montant", cell: ({ row }) => money(row.original.amount) },
          { header: "Statut", cell: ({ row }) => <StatusLabel status={row.original.status} /> }
        ]}
      />
    </Modal>
  );
}
