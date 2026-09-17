import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { ApiOfflineBanner } from "@/components/api-offline-banner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Three Out of Forty",
  description: "Weekly tender triage for construction bid estimators.",
};

const NAV_LINKS = [
  { href: "/", label: "Triage" },
  { href: "/companies", label: "Companies" },
  { href: "/ingest", label: "Ingest" },
] as const;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 text-[16px] text-zinc-900">
        <ApiOfflineBanner />
        <header className="border-b border-zinc-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center gap-8 px-6 py-4">
            <span className="text-lg font-semibold">Three Out of Forty</span>
            <nav className="flex gap-6 text-base">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-zinc-700 hover:text-zinc-950 hover:underline"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
