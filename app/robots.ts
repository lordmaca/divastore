import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
  const base = SITE_URL;
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/", "/checkout", "/minha-conta", "/carrinho"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
