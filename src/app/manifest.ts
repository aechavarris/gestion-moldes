import type { MetadataRoute } from "next";

/** Lets the phone install the site from the browser menu ("Añadir a pantalla de inicio"). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fichas técnicas",
    short_name: "Fichas",
    description: "Clientes y fichas técnicas",
    start_url: "/",
    display: "standalone",
    background_color: "#0f1216",
    theme_color: "#1f6feb",
    lang: "es",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
