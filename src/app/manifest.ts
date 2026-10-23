import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Thusa",
    short_name: "Thusa",
    description: "Get paid on your parents' payday.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#F5F5F4",
    theme_color: "#FFFFFF",
    icons: [
      { src: "/thusa-logo/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/thusa-logo/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
