import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInForm } from "@/components/auth/sign-in-form";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default function SignInPage() {
  return (
    <div className="container-page grid min-h-[70vh] place-items-center py-12">
      <Suspense>
        <SignInForm />
      </Suspense>
    </div>
  );
}
