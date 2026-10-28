import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#06080c",
};

export const metadata: Metadata = {
  title: "RTS-MK1 — Classic Multiplayer RTS (rts-mk1.orbital8.cloud)",
  description:
    "RTS-MK1 v1.3.0 — Classic Command & Conquer / Dune 2000 RTS with Hybrid OffscreenCanvas 16-angle procedural graphics, 20 Hz deterministic simulation, Single Active Match Mutex, and Mobile Landscape Touch Controls.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="dark">
      <body className="bg-obsidian text-slate-100 antialiased">{children}</body>
    </html>
  );
}
