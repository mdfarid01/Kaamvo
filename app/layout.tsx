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
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
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

// The icon mark from media/icon.svg, inlined so the wordmark next to it renders
// in Geist. Shipping logo-horizontal.svg as an <img> would draw its baked-in
// Arial <text> instead, which reads as a different font from the rest of the UI.
function KaamvoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true" focusable="false">
      <rect width="512" height="512" rx="112" fill="#2C2C2A" />
      <rect x="150" y="150" width="86" height="86" rx="20" fill="#5F5E5A" />
      <rect x="276" y="150" width="86" height="86" rx="20" fill="#5F5E5A" />
      <rect x="150" y="276" width="86" height="86" rx="20" fill="#5F5E5A" />
      <circle cx="319" cy="319" r="43" fill="#D85A30" />
    </svg>
  );
}

function SiteHeader() {
  return (
    <header className="border-b border-line-soft">
      <div className="mx-auto flex h-[76px] w-full max-w-content items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5 text-ink">
          <KaamvoMark className="h-8 w-8" />
          <span className="text-[22px] font-medium tracking-[-0.015em]">kaamvo</span>
        </Link>
        <span className="text-[14px] text-muted">Runs in your browser</span>
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
