import type { Metadata } from "next";
import { MentorProfile } from "./mentor-profile";
import { serverApi } from "@/lib/server-api";
import type { MentorDetail } from "@/lib/types";

/** Gives each mentor their own title, description and link preview. */
export async function generateMetadata({ params }: PageProps<"/mentors/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const m = await serverApi<MentorDetail>(`/mentors/${encodeURIComponent(slug)}`);
  if (!m) return { title: "Mentor profile — POINT B Mentors" };
  const title = `${m.name}, ${m.title} — POINT B Mentors`;
  const description = `Book a private 30-minute conversation with ${m.name}${m.organization ? `, ${m.title} at ${m.organization}` : `, ${m.title}`}. ${m.introduction}`.slice(0, 160).trim();
  return {
    title, description,
    alternates: { canonical: `/mentors/${m.slug}` },
    // Sample profiles shouldn't appear in search results.
    robots: m.isDemo ? { index: false, follow: true } : undefined,
    openGraph: { title, description, type: "profile", url: `/mentors/${m.slug}`, ...(m.photoUrl ? { images: [{ url: m.photoUrl, alt: m.name }] } : {}) },
  };
}

export default function MentorProfilePage() {
  return <MentorProfile />;
}
