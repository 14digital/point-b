import 'dotenv/config';
import { MentorCategory, MentorLevel, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();
const DEMO = process.argv.includes('--demo');

const PRICES: [MentorLevel, 'PKR' | 'GBP', number][] = [
  ['PROFESSIONAL', 'PKR', 100000], ['PROFESSIONAL', 'GBP', 2500],
  ['SENIOR_SPECIALIST', 'PKR', 150000], ['SENIOR_SPECIALIST', 'GBP', 4000],
  ['EXECUTIVE', 'PKR', 250000], ['EXECUTIVE', 'GBP', 6000],
];

const DEMO_MENTORS: {
  slug: string; name: string; title: string; org: string; country: string; category: MentorCategory; level: MentorLevel;
  languages: string[]; expertise: string[]; industries: string[]; intro: string; career: string; quals: string[];
  achievements: string[]; help: string[]; outside: string[]; hours: number[];
}[] = [
  { slug: 'anand-rao', name: 'Anand Rao', title: 'Senior Vice President, Consumer Banking', org: 'Standard Chartered', country: 'United Arab Emirates', category: 'INTERNATIONAL', level: 'EXECUTIVE', languages: ['English', 'Urdu', 'Hindi'], expertise: ['Executive Communication', 'Team Leadership & Coaching'], industries: ['Banking & Financial Services'], intro: 'I lead consumer banking for a regional market and spend most of my week in rooms where a clear argument, well delivered, decides whether a plan moves forward.', career: 'Thirty years in banking across Karachi, Dubai and London, from branch operations into regional leadership. I have hired, managed and let go of a lot of people.', quals: ['MBA, Lahore University of Management Sciences'], achievements: ['Built and led a 400-person consumer banking division across three markets'], help: ['Preparing for senior leadership interviews', 'Giving difficult feedback', 'Moving from individual contributor to people manager', 'Structuring a case for promotion'], outside: ['Personal investment advice', 'Legal or tax matters'], hours: [13, 14] },
  { slug: 'zainab-malik', name: 'Zainab Malik', title: 'Head of Product', org: 'a Lahore-based fintech scale-up', country: 'Pakistan', category: 'LOCAL', level: 'SENIOR_SPECIALIST', languages: ['English', 'Urdu'], expertise: ['Product Management', 'Software Engineering'], industries: ['Technology', 'Financial Services'], intro: 'I run product for a fast-growing fintech and mentor people moving from engineering or operations into product roles.', career: 'Started as a backend engineer and moved into product eight years ago. I have shipped consumer payment products used by several million people in Pakistan.', quals: ['BSc Computer Science, FAST-NUCES'], achievements: ['Mentored four engineers into their first product roles'], help: ['Breaking into product management', 'Writing a product case study', 'Prioritisation and roadmap conversations'], outside: ['Specific company hiring decisions'], hours: [9, 10, 15] },
  { slug: 'daniyal-farooq', name: 'Daniyal Farooq', title: 'Co-founder', org: 'a logistics technology company', country: 'Pakistan', category: 'LOCAL', level: 'PROFESSIONAL', languages: ['English', 'Urdu', 'Punjabi'], expertise: ['Entrepreneurship', 'Operations & Supply Chain'], industries: ['Logistics', 'Technology'], intro: 'I co-founded a logistics company four years ago and we are still working through the problems most first-time founders in Pakistan hit.', career: 'Worked in supply chain for a multinational FMCG company before starting my own business.', quals: ['BBA, Institute of Business Administration, Karachi'], achievements: ['Raised a seed round from regional investors'], help: ['Deciding whether to leave a stable job', 'Early operational and hiring decisions', 'Talking to investors for the first time'], outside: ['Guaranteed investor introductions', 'Legal structuring advice'], hours: [14, 15] },
  { slug: 'emily-hartshorn', name: 'Emily Hartshorn', title: 'Director of Marketing', org: 'a European consumer goods group', country: 'United Kingdom', category: 'INTERNATIONAL', level: 'SENIOR_SPECIALIST', languages: ['English'], expertise: ['Marketing & Brand'], industries: ['Consumer Goods', 'Retail'], intro: 'I have spent most of my career building brand and marketing teams in London.', career: 'Fifteen years across agency and client-side marketing, the last six leading brand strategy for a portfolio sold in over forty countries.', quals: ['MSc Marketing, University of Manchester'], achievements: ['Led a rebrand across twelve markets'], help: ['Breaking into brand marketing', 'Building a portfolio for interviews', 'Working with international teams'], outside: ['Reviewing confidential campaigns'], hours: [12, 13] },
  { slug: 'hassan-sheikh', name: 'Hassan Sheikh', title: 'Senior Software Engineer', org: 'a European cloud infrastructure company', country: 'Germany', category: 'INTERNATIONAL', level: 'PROFESSIONAL', languages: ['English', 'Urdu'], expertise: ['Software Engineering', 'Data & Analytics'], industries: ['Technology'], intro: 'I moved from Lahore to Berlin six years ago to work in infrastructure engineering.', career: 'Started at a local software house, relocated to a European cloud company, now working on distributed systems.', quals: ['BSc Computer Science, UET Lahore'], achievements: ['Relocated internationally twice on skilled worker visas'], help: ['International technical interviews', 'Relocating for tech roles in Europe', 'Backend career progression'], outside: ['Visa legal advice'], hours: [17, 18] },
  { slug: 'sana-qureshi', name: 'Dr Sana Qureshi', title: 'Consultant Physician', org: 'a teaching hospital in Lahore', country: 'Pakistan', category: 'LOCAL', level: 'SENIOR_SPECIALIST', languages: ['English', 'Urdu'], expertise: ['Medicine & Healthcare', 'Academic & University Admissions'], industries: ['Healthcare'], intro: 'I practise as a consultant physician and speak with students most weeks who are weighing medicine against other paths.', career: 'Qualified from King Edward Medical University and trained further in internal medicine.', quals: ['MBBS, King Edward Medical University', 'FCPS Internal Medicine'], achievements: ['Supervises postgraduate trainees'], help: ['Deciding whether to pursue medicine', 'Medical school admissions', 'Life as a junior doctor'], outside: ['Personal medical advice or diagnosis'], hours: [6, 7] },
];

async function main() {
  for (const [level, currency, priceMinor] of PRICES) {
    await prisma.pricingRule.upsert({ where: { level_currency: { level, currency } }, create: { level, currency, priceMinor }, update: {} });
  }

  const email = (process.env.ADMIN_EMAIL ?? 'admin@pointb.example').toLowerCase();
  if (!(await prisma.user.findUnique({ where: { email } }))) {
    const password = process.env.ADMIN_PASSWORD ?? randomBytes(9).toString('base64url');
    await prisma.user.create({ data: { email, name: 'POINT B Admin', role: 'ADMIN', passwordHash: await bcrypt.hash(password, 12) } });
    console.log(`Created admin ${email} / ${process.env.ADMIN_PASSWORD ? '(password from ADMIN_PASSWORD)' : password}`);
  }

  if (!DEMO) return console.log('Seeded pricing + admin. Run with --demo to add clearly labelled demonstration mentors.');

  const hash = await bcrypt.hash('Mentor#12345', 10);
  for (const m of DEMO_MENTORS) {
    const user = await prisma.user.upsert({ where: { email: `${m.slug}@demo.pointb.example` }, create: { email: `${m.slug}@demo.pointb.example`, name: m.name, role: 'MENTOR', passwordHash: hash }, update: {} });
    const profile = await prisma.mentorProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, slug: m.slug, title: m.title, organization: m.org, country: m.country, category: m.category, level: m.level, languages: m.languages, expertise: m.expertise, industries: m.industries, introduction: m.intro, careerSummary: m.career, qualifications: m.quals, achievements: m.achievements, helpTopics: m.help, outsideScope: m.outside, verified: true, isDemo: true, status: 'ACTIVE', agreementAcceptedAt: new Date() },
      update: {},
    });
    const data: { mentorId: string; startAt: Date; endAt: Date; kind: "ONE_TO_ONE" | "GROUP"; capacity: number }[] = [];
    for (let d = 1; d <= 21; d++) {
      const day = new Date(); day.setUTCDate(day.getUTCDate() + d);
      if ([0, 6].includes(day.getUTCDay()) && d % 2) continue;
      for (const h of m.hours) for (const min of [0, 30]) {
        const startAt = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h, min));
        const group = h === m.hours[m.hours.length - 1] && min === 30; // last half-hour of each day is a group session
        data.push({ mentorId: profile.id, startAt, endAt: new Date(startAt.getTime() + 30 * 60_000), kind: group ? 'GROUP' : 'ONE_TO_ONE', capacity: group ? 4 : 1 });
      }
    }
    // Idempotent: never delete slots (bookings may reference them). Add missing ones, and convert untouched ones to the intended type.
    const existing = new Set((await prisma.availabilitySlot.findMany({ where: { mentorId: profile.id }, select: { startAt: true } })).map((x) => x.startAt.getTime()));
    const fresh = data.filter((d) => !existing.has(d.startAt.getTime()));
    if (fresh.length) await prisma.availabilitySlot.createMany({ data: fresh });
    for (const d of data.filter((x) => x.kind === 'GROUP')) await prisma.availabilitySlot.updateMany({ where: { mentorId: profile.id, startAt: d.startAt, seatsTaken: 0 }, data: { kind: 'GROUP', capacity: 4 } });
  }
  console.log(`Seeded ${DEMO_MENTORS.length} demonstration mentors (password Mentor#12345, isDemo=true).`);
}

main().finally(() => prisma.$disconnect());
