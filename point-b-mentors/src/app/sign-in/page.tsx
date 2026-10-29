import { Suspense } from "react";
import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in — POINT B Mentors" };

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}
