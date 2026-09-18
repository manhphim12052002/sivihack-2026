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
  title: "Arctis Compass",
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
        <header className="sticky top-0 z-40 border-b border-[#E2DDD8]" style={{ background: "#FFFFFF", borderTop: "3px solid #0C0C0C" }}>
          <div className="mx-auto flex max-w-6xl items-center px-8 py-5">
            {/* Logo */}
            <Link
              href="/"
              className="text-sm font-semibold tracking-tight text-[#2B2825] shrink-0"
            >
              Arctis Compass
            </Link>
            {/* Centered nav */}
            <nav className="flex flex-1 justify-center gap-10">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="group relative text-sm font-medium text-[#5A5652] transition-colors hover:text-[#2B2825]"
                >
                  {link.label}
                  <span className="absolute -bottom-1 left-0 h-[1.5px] w-0 bg-[#2B2825] transition-all duration-200 group-hover:w-full" />
                </Link>
              ))}
            </nav>
            {/* Mirror spacer to keep links centered */}
            <span className="shrink-0 text-sm font-semibold invisible select-none" aria-hidden>Arctis Compass</span>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
