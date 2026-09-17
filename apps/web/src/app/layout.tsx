import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { ApiOfflineBanner } from "@/components/api-offline-banner";

const inter = Inter({
  variable: "--font-inter",
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
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[--color-bg] text-[--color-text-primary]">
        <ApiOfflineBanner />
        <header className="border-b border-[--color-border] bg-[--color-surface]">
          <div className="mx-auto flex max-w-6xl items-center gap-8 px-6 py-4">
            <span className="text-lg font-semibold text-[--color-charcoal]">Three Out of Forty</span>
            <nav className="flex gap-6 text-base">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-[--color-text-secondary] hover:text-[--color-text-primary] hover:underline underline-offset-2"
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
