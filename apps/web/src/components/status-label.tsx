import { StatusBadge } from "@as-tino/ui";
const labels: Record<string, string> = { DRAFT: "Brouillon", SENT: "Envoyé", ACCEPTED: "Accepté", REJECTED: "Refusé", EXPIRED: "Expiré", CANCELLED: "Annulé", ISSUED: "Émise", PARTIALLY_PAID: "Paiement partiel", PAID: "Payée", OVERDUE: "En retard", CONFIRMED: "Confirmé", DELIVERED: "Livré", ACTIVE: "Actif", ARCHIVED: "Archivé", INACTIVE: "Désactivé", OPEN: "À traiter", RESOLVED: "Résolu", INITIAL_STOCK: "Stock initial", ENTRY: "Entrée", WITHDRAWAL: "Retrait", CUSTOMER_DELIVERY: "Livraison client", RETURN: "Retour", DAMAGED: "Dommage", ADJUSTMENT: "Ajustement", CANCELLATION_REVERSAL: "Contre-mouvement", CASH: "Espèces", BANK_TRANSFER: "Virement", CHECK: "Chèque", CARD: "Carte", OTHER: "Autre", PENDING: "En attente", SENDING: "Envoi en cours", FAILED: "Échec", REGISTERED: "Enregistré" };
export function statusText(value: string) { return labels[value] ?? value; }
export function StatusLabel({ status }: { status: string }) {
  const tone = ["PAID", "ACCEPTED", "DELIVERED", "ACTIVE", "RESOLVED", "REGISTERED"].includes(status) ? "green" : ["OVERDUE", "CANCELLED", "FAILED"].includes(status) ? "red" : ["PARTIALLY_PAID", "EXPIRED", "OPEN"].includes(status) ? "amber" : ["SENT", "ISSUED", "CONFIRMED"].includes(status) ? "teal" : "slate";
  return <StatusBadge tone={tone}>{statusText(status)}</StatusBadge>;
}
