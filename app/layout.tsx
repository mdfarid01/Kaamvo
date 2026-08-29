import type { Metadata, Viewport } from "next";
import Link from "next/link";
// The `geist` package wraps next/font/local around the shipped Geist files.
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Kaamvo — Small tools that get the job done",
    template: "%s — Kaamvo",
  },
  description:
    "A collection of fast, private file and text tools. No account required. Files never leave your device.",
};

export const viewport: Viewport = {
  themeColor: "#F1EFE8",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen font-sans">
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}

function SiteHeader() {
  return (
    <header className="border-b border-line-soft">
      <div className="mx-auto flex h-14 w-full max-w-content items-center justify-between px-6">
        <Link href="/" className="text-[15px] font-medium tracking-[-0.01em] text-ink">
          kaamvo
        </Link>
        <span className="text-[13px] text-muted">Runs in your browser</span>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-line-soft">
      <div className="mx-auto flex w-full max-w-content flex-col gap-1 px-6 py-8 text-[13px] text-muted sm:flex-row sm:items-center sm:justify-between">
        <span>Kaamvo</span>
        <span>Nothing is uploaded. Everything runs locally.</span>
      </div>
    </footer>
  );
}
