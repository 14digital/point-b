"use client";

import Link from "next/link";
import { MentorPhoto, Skeleton } from "./ui";
import { ComingSoon, CourseCard, FacultyTile } from "./course-card";
import { Reveal } from "./motion";
import { useApi } from "@/lib/use-api";
import { fmtDayShort } from "@/lib/format";
import type { Course, FacultyMember } from "@/lib/types";

const useFaculty = () => useApi<FacultyMember[]>("/courses/faculty");
const useCourses = () => useApi<Course[]>("/courses");

/** Above the hero headline: the faculty's faces, and how many are teaching this season. */
export function FacultyBadge() {
  const { data } = useFaculty();
  if (!data?.length) return null;
  const courses = data.reduce((n, m) => n + m.courses.length, 0);
  return (
    <div className="flex items-center gap-3 text-sm text-white/90">
      <span className="flex -space-x-2">
        {data.slice(0, 5).map((m) => <span key={m.id} className="h-7 w-7 overflow-hidden rounded-full ring-2 ring-white/60"><MentorPhoto name={m.name} photoUrl={m.photoUrl} className="h-full w-full" initialsClass="text-[11px]" /></span>)}
      </span>
      {data.length} faculty · {courses} course{courses === 1 ? "" : "s"} this season
    </div>
  );
}

/** The next few courses, as chips along the bottom of the hero. */
export function HeroCourses() {
  const { data } = useCourses();
  const list = (data ?? []).filter((c) => c.open).slice(0, 4);
  if (!list.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-2 hidden shrink-0 text-sm text-white/75 sm:inline">Starting soon:</span>
      {list.map((c) => (
        <Link key={c.id} href={`/courses/${c.slug}`} className="whitespace-nowrap rounded-full bg-white/15 px-4 py-2 text-sm text-white ring-1 ring-white/20 backdrop-blur-md transition-colors hover:bg-white/25">
          {c.title}{c.nextClass ? <span className="text-white/65"> · {fmtDayShort(c.nextClass.startAt)}</span> : null}
        </Link>
      ))}
    </div>
  );
}

/** The whole faculty, as portrait tiles. */
export function FacultyGrid() {
  const { data, loading } = useFaculty();
  if (loading) return <div className="mt-12 grid grid-cols-2 gap-4 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="aspect-[4/5] rounded-[1.75rem]" />)}</div>;
  const list = data ?? [];
  if (!list.length) return <div className="mt-12"><ComingSoon compact title="The faculty is being announced" body="Senior leaders from around the world, coming to Pakistan to teach. Names and courses appear here as dates are confirmed." /></div>;
  return (
    <div className={`mt-12 grid grid-cols-2 gap-4 ${list.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
      {list.map((m, i) => <Reveal key={m.id} delay={(i % 4) * 70}><FacultyTile m={m} /></Reveal>)}
    </div>
  );
}

/** Courses open for enrolment, soonest first. */
export function CourseGrid({ limit = 6 }: { limit?: number }) {
  const { data, loading } = useCourses();
  if (loading) return <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[420px] rounded-[1.75rem]" />)}</div>;
  const list = (data ?? []).filter((c) => c.open).slice(0, limit);
  if (!list.length) return <div className="mt-12"><ComingSoon compact title="First courses opening soon" body="Dates, topics and prices in rupees are being set now. Every course will be listed here the day it opens." /></div>;
  return (
    <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((c, i) => <Reveal key={c.id} delay={(i % 3) * 80}><CourseCard course={c} className="h-full" /></Reveal>)}
    </div>
  );
}
