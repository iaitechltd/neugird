import type { Metadata } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import MatrixRain from "@/components/MatrixRain";
import HudBackground from "@/components/HudBackground";

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

export const metadata: Metadata = {
  title: "NeuGrid — Coordination Network",
  description:
    "NeuGrid is the operating system for tokenized internet communities. Form programmable networks called Grids: identity, reputation, campaigns, talent, agents, and launches.",
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
        <MatrixRain />
        {children}
      </body>
    </html>
  );
}
