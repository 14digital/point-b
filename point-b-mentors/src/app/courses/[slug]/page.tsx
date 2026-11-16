import type { Metadata } from "next";
import { serverApi } from "@/lib/server-api";
import type { CourseDetail } from "@/lib/types";
import { CoursePage } from "./course-page";

/** Each course gets its own title, description and link preview. */
export async function generateMetadata({ params }: PageProps<"/courses/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const c = await serverApi<CourseDetail>(`/courses/${encodeURIComponent(slug)}`);
  if (!c) return { title: "Course — POINT B Mentors" };
  const title = `${c.title}, with ${c.mentor.name} — POINT B Mentors`;
  const description = `${c.schedule}, ${c.sessionsCount} live online classes. ${c.summary}`.slice(0, 160).trim();
  return {
    title, description,
    alternates: { canonical: `/courses/${c.slug}` },
    openGraph: { title, description, type: "website", url: `/courses/${c.slug}`, ...(c.mentor.photoUrl ? { images: [{ url: c.mentor.photoUrl, alt: c.mentor.name }] } : {}) },
  };
}

export default function Page() {
  return <CoursePage />;
}
