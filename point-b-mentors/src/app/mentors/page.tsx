import type { Metadata } from "next";
import { FacultyPage } from "./faculty";

export const metadata: Metadata = {
  title: "Faculty — POINT B",
  description: "Meet the invited faculty teaching live courses for Pakistan on POINT B.",
};

export default function MentorsPage() {
  return <FacultyPage />;
}
