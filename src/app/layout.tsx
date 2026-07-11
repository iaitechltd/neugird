import type { Metadata } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import HudBackground from "@/components/HudBackground";
import NeuGridDock from "@/components/app/NeuGridDock";
import TestnetNotice from "@/components/app/TestnetNotice";

// Mono for data/labels/body; Space Grotesk display for titles + headlines.
const mono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});
const display = Space_Grotesk({
  variable: "--font-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const SITE_URL = process.env.NEUGRID_PUBLIC_URL ?? "https://neugrid-188737658015.us-central1.run.app";
const SITE_TITLE = "NeuGrid — Coordination Network";
const SITE_DESC =
  "NeuGrid is the operating system for tokenized internet communities. Form programmable networks called Grids: identity, reputation, campaigns, talent, agents, and launches.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESC,
  openGraph: {
    type: "website",
    siteName: "NeuGrid",
    title: SITE_TITLE,
    description: SITE_DESC,
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESC,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${mono.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <HudBackground />
        {/* MatrixRain retired 2026-07-03 — the terminal room is pure black */}
        {children}
        {/* The terminal keybar lives OUTSIDE every page's `zoom: 0.9` frame — a
            fixed element inside a zoomed ancestor has an offset click hit-region
            in Chrome (looked clickable, wasn't). Rendered once here, it hides
            itself on "/" and "/d/". */}
        <NeuGridDock />
        {/* staging-only "test money" chip — renders nothing in demo mode */}
        <TestnetNotice />
      </body>
    </html>
  );
}
