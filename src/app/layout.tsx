import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { ServiceWorkerRegistrar } from "@/components/pwa/ServiceWorkerRegistrar";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MuseFlow",
  description: "Turn raw ideas into interactive content flows.",
  applicationName: "MuseFlow",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MuseFlow",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.svg", sizes: "192x192", type: "image/svg+xml" },
      { url: "/icons/icon-512.svg", sizes: "512x512", type: "image/svg+xml" },
    ],
    apple: { url: "/icons/apple-touch-icon.svg" },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0b1020",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        {children}
        <Toaster />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
