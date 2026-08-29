import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-content px-6 py-20">
      <h1 className="text-[28px] font-medium tracking-[-0.01em] text-ink">Page not found</h1>
      <p className="mt-2 text-[15px] text-muted">
        That tool doesn’t exist — or hasn’t been added to the list yet.
      </p>
      <div className="mt-6">
        <ButtonLink href="/">Browse all tools</ButtonLink>
      </div>
    </div>
  );
}
