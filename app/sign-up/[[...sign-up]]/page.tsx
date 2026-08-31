import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";

export const metadata: Metadata = {
  title: "Sign up",
  description: "Create a Kaamvo account to get access to the AI tools as they ship.",
};

export default function SignUpPage() {
  return (
    <div className="mx-auto flex w-full max-w-content justify-center px-6 py-20 md:py-28">
      <SignUp path="/sign-up" />
    </div>
  );
}
