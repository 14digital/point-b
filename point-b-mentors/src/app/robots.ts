import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/server-api";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/dashboard", "/account", "/session", "/receipt", "/interview", "/reset-password", "/api"] },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
