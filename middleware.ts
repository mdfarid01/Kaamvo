import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Every route is public for now — nothing here is gated server-side yet. This
 * still has to run so `auth()` and <SignedIn>/<SignedOut> can read the session.
 */
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next internals and static assets unless they show up in search params.
    // `m?js` rather than Clerk's default `js` so /pdfjs/pdf.worker.min.mjs is
    // served without a middleware hop.
    "/((?!_next|[^?]*\\.(?:html?|css|m?js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
