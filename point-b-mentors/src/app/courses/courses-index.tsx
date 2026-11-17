"use client";

import { Container, EmptyState, Mark, Skeleton } from "@/components/ui";
import { ComingSoon, CourseCard } from "@/components/course-card";
import { Reveal } from "@/components/motion";
import { useApi } from "@/lib/use-api";
import type { Course } from "@/lib/types";

/** Every course open now or still running, soonest first. */
export function CoursesIndex() {
  const { data, loading, error } = useApi<Course[]>("/courses");
  const list = data ?? [];
  const open = list.filter((c) => c.open);
  const rest = list.filter((c) => !c.open);
  return (
    <div className="pb-24">
      <section className="bg-lemon/40 pb-14 pt-14 sm:pt-20">
        <Container>
          <p className="text-sm font-medium text-brass-dark">Courses</p>
          <h1 className="mt-3 max-w-3xl font-display text-[2.9rem] leading-[1.02] text-ink sm:text-7xl">Every course, <Mark color="peach">in one place</Mark>.</h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-soft">Each one is a few weeks of live online classes with someone who has led at the top of their field. One fee in rupees covers every class.</p>
        </Container>
      </section>
      <Container className="pt-12">
        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[420px] rounded-[1.75rem]" />)}</div>
        ) : error ? <EmptyState title="Courses couldn’t load" description={error} /> : list.length === 0 ? (
          <ComingSoon title="This season’s courses are being scheduled" body="Our faculty is setting dates and topics now. Each course will appear here with every class date and its price in rupees, so you can take your place the day it opens." />
        ) : (
          <>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {open.map((c, i) => <Reveal key={c.id} delay={(i % 3) * 80}><CourseCard course={c} className="h-full" /></Reveal>)}
            </div>
            {rest.length > 0 && (
              <>
                <h2 className="mt-16 font-display text-3xl text-ink">Running now</h2>
                <p className="mt-1 text-sm text-ink-soft">These courses are under way and closed to new learners.</p>
                <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{rest.map((c) => <CourseCard key={c.id} course={c} className="h-full opacity-80" />)}</div>
              </>
            )}
          </>
        )}
      </Container>
    </div>
  );
}
