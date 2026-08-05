import type { MetadataRoute } from "next";

// Ships inert: nothing prompts a player to install (that's the flag-gated
// Phase 5 work). This just makes the site installable.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hightop Challenge",
    short_name: "Hightop",
    // An installed app starts with an empty cookie jar; proxy.ts's auth
    // gate redirects cookie-less requests to "/", the join flow. Any game
    // route here would cold-launch straight into a redirect.
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#020617",
    theme_color: "#020617",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
