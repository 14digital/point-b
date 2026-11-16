import type { Metadata } from "next";
import { CoursesIndex } from "./courses-index";

export const metadata: Metadata = {
  title: "Courses — POINT B Mentors",
  description: "Live online courses in Pakistan, taught over a few weeks by senior leaders from around the world. Prices in rupees.",
};

export default function CoursesPage() {
  return <CoursesIndex />;
}
