import type { Metadata } from "next";
import { Geist, Roboto } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import CookieBanner from "@/components/ui/CookieBanner";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const roboto = Roboto({ weight: ['400', '500', '700', '900'], subsets: ['latin'], variable: '--font-roboto' });

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
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Build Your Network" }],
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
    <html lang="en" className={`${geist.variable} ${roboto.variable} h-full antialiased`}>
      <body className="h-full bg-[var(--bg)] text-[var(--text)]">
        <AuthProvider>
          {children}
          <CookieBanner />
        </AuthProvider>
      </body>
    </html>
  );
}
