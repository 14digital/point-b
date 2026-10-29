import { Suspense } from "react";
import { MentorsDirectory } from "./mentors-directory";

export const metadata = { title: "Explore Mentors — POINT B Mentors" };

export default function MentorsPage() {
  return (
    <Suspense fallback={null}>
      <MentorsDirectory />
    </Suspense>
  );
}
