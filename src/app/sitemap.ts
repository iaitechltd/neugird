/**
 * Public sitemap for crawlers + AI agents. Base URL from NEUGRID_PUBLIC_URL,
 * falling back to the production host. Lists only stable public routes.
 */

import type { MetadataRoute } from "next";

const BASE = (process.env.NEUGRID_PUBLIC_URL || "https://neugrid.io").replace(/\/$/, "");

const ROUTES = [
  "/",
  "/home",
  "/markets",
  "/leaderboard",
  "/about",
  "/terms",
  "/privacy",
  "/agents",
  "/jobs",
  "/talent",
  "/genesis/board",
  "/governance",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return ROUTES.map((path) => ({
    url: `${BASE}${path}`,
    lastModified: now,
    changeFrequency: "daily" as const,
    priority: path === "/" ? 1 : 0.7,
  }));
}
