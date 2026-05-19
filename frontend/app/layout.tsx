import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Build Your Network — The Professional Network Built on Relationships",
  description: "Join ambitious founders, operators, creators, and investors building real professional relationships. Your next opportunity is one relationship away.",
  metadataBase: new URL("https://app.buildyournetwork.online"),
  openGraph: {
    title: "Build Your Network — Relationship-Driven Professional Network",
    description: "Your next opportunity is probably one relationship away. Join 10,000+ founders, operators, and creators on BYN.",
    url: "https://app.buildyournetwork.online",
    siteName: "Build Your Network",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Build Your Network" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Build Your Network",
    description: "Your next opportunity is probably one relationship away.",
  },
  keywords: ["professional networking", "founder network", "startup community", "networking app India", "build your network"],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-white text-zinc-900">{children}</body>
    </html>
  );
}
