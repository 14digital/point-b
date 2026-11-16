/**
 * End-to-end check of courses: a mentor plans one, the team approves and prices it, learners enrol and pay, seats,
 * cancellation, the call gate and the mentor's fee. Run against a throwaway database:
 *   DATABASE_URL=... API=http://localhost:4100/api ADMIN_EMAIL=... ADMIN_PASSWORD=... npx ts-node --transpile-only test/courses.ts
 */
import { PrismaClient } from '@prisma/client';

const BASE = process.env.API ?? 'http://localhost:4100/api';
const prisma = new PrismaClient();
let pass = 0, fail = 0;
const ok = (c: unknown, name: string) => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${name}`); };
async function call(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  let data: any; try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}
const pkDate = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });

async function main() {
  const run = Date.now().toString(36);
  const admin = (await call('POST', '/auth/login', { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })).data?.accessToken;
  ok(admin, 'admin signs in');
  const mt = (await call('POST', '/auth/login', { email: 'zainab-malik@demo.pointb.example', password: 'Mentor#12345' })).data.accessToken;
  ok(mt, 'mentor signs in');

  // Prices are rupees for everyone, wherever they are.
  ok((await call('GET', '/mentors?limit=1')).data.items.every((m: any) => m.currency === 'PKR'), 'mentor prices shown in PKR only');

  const first = new Date(Date.now() + 10 * 86400_000);
  const weekday = new Date(first.getTime() + 5 * 3600_000).getUTCDay();
  const draft = {
    title: `Strategic Leadership ${run}`, summary: 'A four-week course on setting direction and leading a team through change, from strategic intent to milestones.',
    topics: ['Strategic intent', 'The milestone approach', 'Leading through change'], audience: 'New senior managers',
    startDate: pkDate(first), weekdays: [weekday], startTime: '14:00', sessionsCount: 4, sessionMinutes: 90, mentorFeeMinor: 50000, mentorFeeCurrency: 'USD',
  };
  ok((await call('POST', '/courses/me', { ...draft, startDate: pkDate(new Date(Date.now() + 86400_000)), weekdays: [0, 1, 2, 3, 4, 5, 6], submit: true }, mt)).status === 400, 'first class must be at least two days away');
  const saved = await call('POST', '/courses/me', draft, mt);
  ok(saved.status === 201 && saved.data.status === 'DRAFT', 'mentor saves a draft');
  const id = saved.data.id;
  ok(saved.data.classes.length === 4 && saved.data.classes.every((k: any) => new Date(new Date(k.startAt).getTime() + 5 * 3600_000).getUTCDay() === weekday), 'four classes on the chosen weekday');
  ok(new Date(saved.data.classes[0].startAt).toISOString().endsWith('09:00:00.000Z'), '2 pm Pakistan time is 09:00 UTC');
  ok(saved.data.classes[1].startAt.slice(0, 10) !== saved.data.classes[0].startAt.slice(0, 10), 'classes are a week apart');
  ok((await call('GET', `/courses/${saved.data.slug}`)).status === 404, 'a draft is not public');

  const sent = await call('PUT', `/courses/me/${id}`, { ...draft, submit: true }, mt);
  ok(sent.data.status === 'SUBMITTED', 'mentor sends it for approval');
  ok((await call('PUT', `/courses/me/${id}`, { ...draft, submit: true }, mt)).status === 400, 'cannot edit while with the team');
  ok((await call('POST', `/admin/courses/${id}/return`, { note: 'Please add a session on case studies.' }, admin)).data.status === 'CHANGES_REQUESTED', 'team asks for changes');
  ok((await call('PUT', `/courses/me/${id}`, { ...draft, topics: [...draft.topics, 'Case studies'], submit: true }, mt)).data.status === 'SUBMITTED', 'mentor changes it and sends again');

  const approved = await call('POST', `/admin/courses/${id}/approve`, { priceMinor: 3000000, capacity: 3 }, admin);
  ok(approved.data?.status === 'LIVE' && approved.data.priceMinor === 3000000, 'team publishes it at Rs 30,000');
  ok((await call('POST', `/admin/courses/${id}/approve`, { priceMinor: 3000000 }, admin)).status === 400, 'cannot approve twice');
  ok((await prisma.availabilitySlot.count({ where: { courseId: id } })) === 4, 'four class slots created');

  const pub = await call('GET', `/courses/${approved.data.slug}`);
  ok(pub.status === 200 && pub.data.open && pub.data.seatsLeft === 3 && pub.data.mentorFeeMinor === undefined, 'public page open, 3 seats, mentor fee hidden');
  ok((await call('GET', '/courses/faculty')).data.some((m: any) => m.slug === 'zainab-malik'), 'mentor listed on the faculty page');
  ok((await call('GET', '/courses?mentor=zainab-malik')).data.some((c: any) => c.id === id), 'course listed on the mentor profile');

  // Learners: Pakistani numbers only.
  ok((await call('POST', '/auth/register', { name: 'Uk Learner', email: `uk.${run}@example.com`, password: 'Passw0rd!x', phone: '+447700900123' })).status === 400, 'non-Pakistani number refused at sign-up');
  const learners = await Promise.all(['a', 'b', 'c', 'd'].map(async (n) => {
    const r = await call('POST', '/auth/register', { name: `Learner ${n}`, email: `lrn.${n}.${run}@example.com`, password: 'Passw0rd!x', phone: '+923001234567' });
    await prisma.user.update({ where: { email: `lrn.${n}.${run}@example.com` }, data: { emailVerified: true } });
    return r.data.accessToken as string;
  }));
  ok(learners.every(Boolean), 'four learners sign up with +92 numbers');

  ok((await call('POST', `/courses/${id}/enrol`, { expectedPriceMinor: 100 }, learners[0])).status === 409, 'stale price refused');
  const enrolled = await Promise.all(learners.map((t) => call('POST', `/courses/${id}/enrol`, { expectedPriceMinor: 3000000 }, t)));
  const won = enrolled.filter((r) => r.status === 201), lost = enrolled.filter((r) => r.status === 409);
  ok(won.length === 3 && lost.length === 1, `4 learners race for 3 seats: 3 win (${won.length}/${lost.length})`);
  ok(won.every((r) => r.data.currency === 'PKR' && r.data.priceMinor === 3000000 && r.data.course?.classes.length === 4), 'enrolments in PKR, with all classes');
  const again = await call('POST', `/courses/${id}/enrol`, {}, learners[enrolled.indexOf(won[0])]);
  ok(again.status === 201 && again.data.reference === won[0].data.reference, 'enrolling again resumes the same payment');

  // Pay two with the demo checkout.
  for (const r of won.slice(0, 2)) {
    const t = learners[enrolled.indexOf(r)];
    const co = await call('POST', `/payments/${r.data.reference}/checkout`, {}, t);
    await call('POST', `/payments/mock/${co.data.providerRef}/complete`, {}, t);
  }
  const paid = await call('GET', `/bookings/${won[0].data.reference}`, undefined, learners[enrolled.indexOf(won[0])]);
  ok(paid.data.status === 'CONFIRMED' && paid.data.cancelBy, 'paid enrolment confirmed, with a cancel deadline');
  ok((await call('POST', `/bookings/${won[0].data.reference}/reschedule`, { slotId: approved.data.id }, learners[enrolled.indexOf(won[0])])).status === 400, 'course enrolments cannot be rescheduled');
  const callGate = await call('GET', `/bookings/${won[0].data.reference}/call`, undefined, learners[enrolled.indexOf(won[0])]);
  ok(callGate.data.state === 'too_early' && callGate.data.course?.classNumber === 1, 'class room not open yet, shows class 1');

  // The unpaid third releases their seat; the fourth learner takes it.
  ok((await call('POST', `/bookings/${won[2].data.reference}/cancel`, {}, learners[enrolled.indexOf(won[2])])).status === 201, 'unpaid learner releases their place');
  ok((await call('POST', `/courses/${id}/enrol`, {}, learners[enrolled.indexOf(lost[0])])).status === 201, 'freed seat taken by the next learner');

  // A paid learner cancels in time: full refund to their balance.
  const cancelled = await call('POST', `/bookings/${won[1].data.reference}/cancel`, {}, learners[enrolled.indexOf(won[1])]);
  ok(cancelled.data?.status === 'CANCELLED', 'paid learner cancels before the deadline');
  const wallet = await call('GET', '/wallet', undefined, learners[enrolled.indexOf(won[1])]);
  ok(wallet.data.balances.PKR === 3000000, 'full Rs 30,000 back in their POINT B balance');

  // Mentor and team views.
  const mine = (await call('GET', '/courses/me/list', undefined, mt)).data.find((c: any) => c.id === id);
  ok(mine.enrolled === 1 && mine.roomReference === won[0].data.reference, 'mentor sees 1 enrolled and can open the room');
  ok((await call('GET', `/courses/me/${id}/roster`, undefined, mt)).data.length === 1, 'mentor roster lists the learner');
  ok((await call('GET', `/bookings/${won[0].data.reference}/call`, undefined, mt)).data.state === 'too_early', 'mentor can reach the class room gate');
  const row = (await call('GET', '/admin/courses', undefined, admin)).data.find((c: any) => c.id === id);
  ok(row.revenueMinor === 3000000 && row.enrolled === 1, 'team sees enrolment and revenue');
  ok((await call('PATCH', `/admin/courses/${id}`, { capacity: 0 }, admin)).status === 400, 'seat limit must be at least 1');
  ok((await call('PATCH', `/admin/courses/${id}`, { priceMinor: 3500000, capacity: null }, admin)).data.priceMinor === 3500000, 'team raises the price and removes the seat limit');
  ok((await call('POST', `/admin/courses/${id}/close`, {}, admin)).data.status === 'CLOSED', 'team stops new enrolments');
  ok((await call('POST', `/courses/${id}/enrol`, {}, learners[enrolled.indexOf(won[2])])).status === 404, 'closed course refuses enrolment');
  ok((await call('POST', `/admin/courses/${id}/reopen`, {}, admin)).data.status === 'LIVE', 'team reopens it');

  const fee = await call('POST', `/admin/courses/${id}/fee-paid`, { reference: 'TXN-1' }, admin);
  ok(fee.data?.feePaid?.amountMinor === 50000 && fee.data.feePaid.currency === 'USD', 'team records the mentor fee ($500) as paid');
  ok((await call('POST', `/admin/courses/${id}/fee-paid`, {}, admin)).status === 409, 'fee cannot be paid twice');
  const payouts = (await call('GET', '/mentors/me/payouts', undefined, mt)).data;
  ok(payouts.courses.some((c: any) => c.id === id && c.paidOn) && payouts.sessions.every((s: any) => !s.reference.startsWith('PBC-')), 'mentor sees the course fee paid, not per-learner rows');

  // Mentor can't clash with their own course.
  const clash = await call('POST', '/courses/me', { ...draft, title: `Clash ${run}`, submit: true }, mt);
  ok(clash.status === 409, 'overlapping course refused');

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
