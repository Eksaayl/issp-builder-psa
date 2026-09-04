import type { MetadataRoute } from "next";

// The whole app is behind the PSA sign-in gate. Gated routes answer crawlers
// with a redirect rather than HTML, so the noindex metadata never gets read —
// robots.txt is the only signal that actually lands.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
