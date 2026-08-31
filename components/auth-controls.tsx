"use client";

import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

/**
 * Clerk's <SignedIn>/<SignedOut> read the session on the server when they're
 * rendered from a server component, which opts the whole route out of static
 * rendering. Every tool page on this site is static, so the auth-dependent bits
 * live behind "use client" and resolve from the session on the client instead.
 */

export function HeaderAuth() {
  return (
    <>
      <SignedOut>
        <SignInButton mode="modal">
          <button
            type="button"
            className="rounded-full border border-line px-3.5 py-1.5 text-[13px] font-medium text-ink transition-colors duration-150 hover:border-accent hover:text-accent-deep"
          >
            Sign in
          </button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        {/* Sized to sit on the 76px header without nudging its height. */}
        <UserButton appearance={{ elements: { avatarBox: "h-8 w-8" } }} />
      </SignedIn>
    </>
  );
}

/** Per-card action on /ai-tools: sign-in prompt, or the disabled placeholder. */
export function AiToolAction() {
  return (
    <>
      <SignedOut>
        <SignInButton mode="modal">
          <Button size="sm">Sign in to try</Button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <Button size="sm" variant="secondary" disabled>
          Coming soon
        </Button>
      </SignedIn>
    </>
  );
}
