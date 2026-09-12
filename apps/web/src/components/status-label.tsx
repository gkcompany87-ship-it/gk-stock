import { StatusBadge } from "@as-tino/ui";

const labels: Record<string, string> = {
  DRAFT: "Brouillon",
  SENT: "Envoyé",
  ACCEPTED: "Accepté",
  REJECTED: "Refusé",
  EXPIRED: "Expiré",
  CANCELLED: "Annulé",
  ISSUED: "Émise",
  PARTIALLY_PAID: "Paiement partiel",
  PAID: "Payée",
  OVERDUE: "En retard",
  CONFIRMED: "Confirmé",
  DELIVERED: "Livré",
  ACTIVE: "Actif",
  ARCHIVED: "Archivé",
  INACTIVE: "Désactivé",
  OPEN: "À traiter",
  RESOLVED: "Résolu",
  INITIAL_STOCK: "Stock initial",
  ENTRY: "Entrée",
  WITHDRAWAL: "Retrait",
  CUSTOMER_DELIVERY: "Livraison client",
  RETURN: "Retour",
  DAMAGED: "Dommage",
  ADJUSTMENT: "Ajustement",
  CANCELLATION_REVERSAL: "Contre-mouvement",
  CASH: "Espèces",
  BANK_TRANSFER: "Virement",
  CHECK: "Chèque",
  CARD: "Carte",
  OTHER: "Autre",
  PENDING: "En attente",
  SENDING: "Envoi en cours",
  FAILED: "Échec",
  REGISTERED: "Enregistré",
  CUSTOMER_OWES_US: "Le client nous doit",
  WE_OWE_CUSTOMER: "Crédit client",
  UP_TO_DATE: "À jour",
  CREDIT: "Crédit client"
};

export function statusText(value: string) {
  return labels[value] ?? value;
}

export function StatusLabel({ status }: { status: string }) {
  const tone = ["PAID", "ACCEPTED", "DELIVERED", "ACTIVE", "RESOLVED", "REGISTERED", "UP_TO_DATE"].includes(status)
    ? "green"
    : ["OVERDUE", "CANCELLED", "FAILED"].includes(status)
      ? "red"
      : ["PARTIALLY_PAID", "EXPIRED", "OPEN", "CUSTOMER_OWES_US", "PENDING"].includes(status)
        ? "amber"
        : ["SENT", "ISSUED", "CONFIRMED", "WE_OWE_CUSTOMER", "CREDIT"].includes(status)
          ? "teal"
          : "slate";
  return <StatusBadge tone={tone}>{statusText(status)}</StatusBadge>;
}
