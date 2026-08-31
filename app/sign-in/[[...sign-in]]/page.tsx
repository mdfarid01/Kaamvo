import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Kaamvo to use the AI tools.",
};

export default function SignInPage() {
  return (
    <div className="mx-auto flex w-full max-w-content justify-center px-6 py-20 md:py-28">
      <SignIn path="/sign-in" />
    </div>
  );
}
