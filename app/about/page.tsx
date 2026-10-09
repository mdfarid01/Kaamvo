import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description:
    "Kaamvo is a web-based toolkit bringing together 40+ tools for PDFs, images, text, conversions, generators, and financial calculations.",
};

export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-content px-6 py-20 md:py-28">
      <header className="max-w-3xl">
        <h1 className="text-[42px] font-medium leading-[1.08] tracking-[-0.02em] text-ink md:text-[56px]">
          About Kaamvo
        </h1>
        <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-muted">
          Kaamvo is a web-based toolkit designed to make everyday digital tasks simpler.
        </p>
        <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-muted">
          It brings together 40+ tools for working with PDFs, images, text, conversions,
          generators, financial calculations, and other common tasks in one place.
        </p>
        <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-muted">
          Our goal is to make useful digital tools accessible and straightforward, without
          unnecessary complexity.
        </p>
        <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-muted">
          We&rsquo;re also exploring AI-powered features to help users with tasks such as
          resume improvement, PDF summarization, email drafting, image alt-text generation,
          and text cleanup.
        </p>
      </header>
    </div>
  );
}
