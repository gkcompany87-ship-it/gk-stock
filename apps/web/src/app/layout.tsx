import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { headers } from "next/headers";
import "./globals.css";
import messages from "../messages/fr.json";
import { AppShell } from "../components/app-shell";
import { QueryProvider } from "../providers/query-provider";
import { AuthProvider } from "../providers/auth-provider";
import { FeedbackProvider } from "../providers/feedback-provider";

export const metadata: Metadata = {
  title: { default: "G&K Stock", template: "%s | G&K Stock" },
  description: "Gestion de stock et documents commerciaux de STE G&K DE COMMERCE. Solution développée par AS TINO DEV.",
  applicationName: "G&K Stock",
  icons: { icon: "/company-logo.png", apple: "/company-logo.png" },
  appleWebApp: { capable: true, title: "G&K Stock", statusBarStyle: "default" }
};
export const viewport: Viewport = { width:"device-width", initialScale:1, maximumScale:5, viewportFit:"cover", themeColor:"#0b2138" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await headers();
  return <html lang="fr-TN"><body><NextIntlClientProvider locale="fr-TN" timeZone="Africa/Tunis" messages={messages}><QueryProvider><AuthProvider><FeedbackProvider><AppShell>{children}</AppShell></FeedbackProvider></AuthProvider></QueryProvider></NextIntlClientProvider></body></html>;
}
