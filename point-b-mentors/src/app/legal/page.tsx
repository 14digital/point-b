import { Suspense } from "react";
import { LegalTabs } from "./legal-tabs";

export const metadata = { title: "Legal & Safeguarding — POINT B Mentors" };

export default function LegalPage() {
  return (
    <Suspense fallback={null}>
      <LegalTabs />
    </Suspense>
  );
}
