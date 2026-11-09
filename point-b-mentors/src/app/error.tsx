"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui";
import { StatusPage } from "@/components/status-page";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <StatusPage eyebrow="Something went wrong" title="We hit a snag" body="This one's on us. Please try again, and if it keeps happening, our team will help.">
      <Button onClick={reset}>Try again</Button>
      <Button href="/contact" variant="secondary">Contact support</Button>
    </StatusPage>
  );
}
