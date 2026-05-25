import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import CookieBanner from "@/components/ui/CookieBanner";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Build Your Network — High-Signal Networking for Builders",
  description: "Join ambitious founders, operators, creators, and investors building real professional relationships. Your next opportunity is one relationship away.",
  metadataBase: new URL("https://buildyournetwork.online"),
  openGraph: {
    title: "Build Your Network — Relationship-Driven Professional Network",
    description: "Your next opportunity is probably one relationship away. Join 12,000+ founders, operators, and creators on BYN.",
    url: "https://buildyournetwork.online",
    siteName: "Build Your Network",
    type: "website",
    images: [{ url: "/assets/logo.png", width: 1200, height: 630, alt: "Build Your Network" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Build Your Network",
    description: "Your next opportunity is probably one relationship away.",
  },
  keywords: ["professional networking", "founder network", "startup community", "networking app", "build your network"],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="h-full bg-[var(--bg)] text-[var(--text)]">
        <AuthProvider>
          {children}
          <CookieBanner />
        </AuthProvider>
        <Script strategy="afterInteractive" src="https://www.googletagmanager.com/gtag/js?id=G-5NQDBYG4CJ" />
        <Script id="ga-init" strategy="afterInteractive">{`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-5NQDBYG4CJ');
        `}</Script>
      </body>
    </html>
  );
}
