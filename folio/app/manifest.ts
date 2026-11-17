import type { MetadataRoute } from "next";

/** Makes Folio installable ("Add to Home Screen") with its own icon, opening like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Folio · Portfolio Tracker",
    short_name: "Folio",
    description: "Follow your stocks and precious metals, manage trades, and stay updated on your holdings.",
    start_url: "/portfolio",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#047857",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/512-maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
