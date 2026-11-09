import { Button } from "@/components/ui";
import { StatusPage } from "@/components/status-page";

export const metadata = { title: "Page not found — POINT B Mentors" };

export default function NotFound() {
  return (
    <StatusPage eyebrow="Page not found" title="This isn't point B" body="The page may have moved, or the link may be mistyped. Let's get you back on track.">
      <Button href="/mentors">Find a mentor</Button>
      <Button href="/" variant="secondary">Back to home</Button>
    </StatusPage>
  );
}
