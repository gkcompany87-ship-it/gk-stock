import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "G&K Stock — STE G&K DE COMMERCE",
    short_name: "G&K Stock",
    description: "Gestion de stock et commerciale",
    start_url: "/", scope: "/", display: "standalone",
    background_color: "#f3f6fa", theme_color: "#0b2138", lang: "fr-TN",
    icons: [{ src: "/company-logo.png", sizes: "any", type: "image/png", purpose: "any" }]
  };
}
