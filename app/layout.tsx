import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";
import { ClientProviders } from "@/src/components/ClientProviders";
import CookieBanner from "@/components/CookieBanner";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.invergravital.com"),
  title: {
    default: "Invergravital",
    template: "%s · Invergravital",
  },
  description:
    "Invergravital — herramienta gratuita de análisis y seguimiento de operaciones inmobiliarias: costes, financiación y rentabilidad real.",
  applicationName: "Invergravital",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Invergravital" },
  openGraph: {
    type: "website",
    siteName: "Invergravital",
    title: "Invergravital",
    description:
      "Herramienta gratuita de análisis y seguimiento de operaciones inmobiliarias.",
    url: "https://www.invergravital.com",
    locale: "es_ES",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0f14",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ClientProviders>{children}</ClientProviders>
        <CookieBanner />
        <Toaster richColors position="top-center" />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
