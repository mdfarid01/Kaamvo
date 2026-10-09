import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with Kaamvo for questions, feedback, or business enquiries.",
};

export default function ContactPage() {
  return (
    <div className="mx-auto w-full max-w-content px-6 py-20 md:py-28">
      <header className="max-w-3xl">
        <h1 className="text-[42px] font-medium leading-[1.08] tracking-[-0.02em] text-ink md:text-[56px]">
          Contact Us
        </h1>
        <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-muted">
          Have a question, found an issue, or want to share feedback about Kaamvo?
          We&rsquo;d love to hear from you.
        </p>
        <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-muted">
          For questions, feedback, suggestions, or business enquiries, contact us at:
        </p>
        <a
          href="mailto:hello@kaamvo.in"
          className="mt-5 inline-block text-[17px] font-medium text-accent-deep transition-colors duration-150 hover:text-accent"
        >
          hello@kaamvo.in
        </a>
      </header>
    </div>
  );
}
