import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-mono",
});

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
    "RTS-MK1 v1.11.1 — Classic Command & Conquer / Dune 2000 RTS with Hybrid OffscreenCanvas 16-angle procedural graphics, 20 Hz deterministic simulation, Single Active Match Mutex, and Mobile Landscape Touch Controls.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`dark ${inter.variable} ${jetbrainsMono.variable}`}>
      <body className={`${inter.className} font-sans bg-obsidian text-slate-100 antialiased`}>
        {children}
      </body>
    </html>
  );
}
