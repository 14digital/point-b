import 'dotenv/config';
import { createHmac } from 'crypto';
import { PrismaClient } from '@prisma/client';

const BASE = process.env.API ?? 'http://localhost:4000/api';
const prisma = new PrismaClient();
let pass = 0, fail = 0;
const ok = (c: unknown, name: string) => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${name}`); };

async function call(method: string, path: string, body?: unknown, token?: string, headers: Record<string, string> = {}) {
  const raw = body === undefined ? undefined : JSON.stringify(body);
  const res = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: raw });
  let data: any; try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data, raw };
}
const signed = (payload: object) => { const raw = JSON.stringify(payload); return { raw, sig: createHmac('sha256', process.env.PAYMENT_WEBHOOK_SECRET!).update(raw).digest('hex') }; };
async function webhook(payload: object, badSig = false) {
  const { raw, sig } = signed(payload);
  const res = await fetch(BASE + '/payments/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-signature': badSig ? 'deadbeef' : sig }, body: raw });
  return res.status;
}

async function main() {
  const run = Date.now().toString(36);
  const prep = { currentSituation: 'Final-year student choosing between offers', usefulOutcome: 'A clearer way to compare the two roles' };

  // ---- auth
  const reg = await call('POST', '/auth/register', { name: 'Sara Ahmed', email: `sara.${run}@example.com`, password: 'Passw0rd!x' });
  ok(reg.status === 201 && reg.data.accessToken, 'student registers');
  ok((await call('POST', '/auth/register', { name: 'Sara Ahmed', email: `sara.${run}@example.com`, password: 'Passw0rd!x' })).status === 409, 'duplicate email rejected');
  ok((await call('POST', '/auth/login', { email: `sara.${run}@example.com`, password: 'wrong-pass-1' })).status === 401, 'wrong password rejected');
  const sara = reg.data.accessToken as string;
  ok((await call('GET', '/auth/me', undefined, sara)).data.role === 'STUDENT', 'me returns role');
  ok((await call('GET', '/bookings', undefined)).status === 401, 'bookings require sign-in');
  ok((await call('GET', '/admin/stats', undefined, sara)).status === 403, 'student blocked from admin');

  // ---- discovery
  const list = await call('GET', '/mentors?category=LOCAL');
  ok(list.data.items.length >= 3 && list.data.items.every((m: any) => m.category === 'LOCAL' && m.currency === 'PKR'), 'local filter returns PKR mentors');
  ok(!('userId' in list.data.items[0]), 'list does not leak internal ids');
  const intl = await call('GET', '/mentors?category=INTERNATIONAL&sort=price_desc');
  ok(intl.data.items[0].currency === 'GBP' && intl.data.items[0].priceMinor === 6000, 'international priced in GBP, sorted by price');
  const detail = await call('GET', '/mentors/zainab-malik');
  ok(detail.status === 200 && detail.data.slots.length > 10 && detail.data.priceMinor === 150000, 'mentor detail with live slots and PKR price');
  ok((await call('GET', '/mentors/does-not-exist')).status === 404, 'unknown mentor 404');

  // ---- booking: concurrency
  const slots = detail.data.slots as { id: string; startAt: string }[];
  const far = slots.filter((s) => new Date(s.startAt).getTime() > Date.now() + 72 * 3600_000);
  const racers = await Promise.all(['a', 'b', 'c', 'd', 'e'].map(async (n) => {
    const r = await call('POST', '/auth/register', { name: `Racer ${n}`, email: `racer.${n}.${run}@example.com`, password: 'Passw0rd!x' });
    return r.data.accessToken as string;
  }));
  const results = await Promise.all(racers.map((t) => call('POST', '/bookings', { slotId: far[0].id, agenda: 'Career guidance', ...prep }, t)));
  const wins = results.filter((r) => r.status === 201).length, conflicts = results.filter((r) => r.status === 409).length;
  ok(wins === 1 && conflicts === 4, `5 concurrent bookings of one slot: exactly 1 wins (wins=${wins}, conflicts=${conflicts})`);

  // ---- booking: happy path
  const b = await call('POST', '/bookings', { slotId: far[1].id, agenda: 'Interview preparation', ...prep }, sara);
  ok(b.status === 201 && b.data.status === 'PENDING_PAYMENT' && b.data.meetingLink === null && b.data.priceMinor === 150000, 'booking created pending payment, no link yet');
  const ref = b.data.reference as string, providerRef = b.data.payment.providerRef as string;
  ok((await call('POST', '/bookings', { slotId: far[1].id, agenda: 'Other', ...prep }, racers[0])).status === 409, 'held slot cannot be double-booked');
  ok((await call('POST', '/bookings', { slotId: far[2].id, agenda: 'Nonsense', ...prep }, sara)).status === 400, 'invalid agenda rejected');
  ok((await webhook({ providerRef, status: 'succeeded' }, true)) === 401, 'webhook with bad signature rejected');
  ok((await call('GET', `/bookings/${ref}`, undefined, sara)).data.status === 'PENDING_PAYMENT', 'bad webhook did not confirm booking');
  ok((await webhook({ providerRef, status: 'succeeded' })) === 200, 'signed webhook accepted');
  ok((await webhook({ providerRef, status: 'succeeded' })) === 200, 'webhook is idempotent');
  const conf = await call('GET', `/bookings/${ref}`, undefined, sara);
  ok(conf.data.status === 'CONFIRMED' && conf.data.meetingLink?.includes(ref), 'booking confirmed with meeting link after webhook');
  ok((await call('GET', `/bookings/${ref}`, undefined, racers[1])).status === 404, 'other student cannot read booking');
  ok((await call('GET', '/bookings', undefined, sara)).data.length === 1, 'student sees own booking');
  const after = await call('GET', '/mentors/zainab-malik');
  ok(!after.data.slots.some((s: any) => s.id === far[1].id), 'booked slot removed from public availability');

  // ---- cancel + refund frees slot
  ok((await call('POST', `/bookings/${ref}/cancel`, {}, sara)).data.status === 'CANCELLED', 'student cancels with enough notice');
  const pay = await prisma.payment.findUnique({ where: { providerRef } });
  ok(pay?.status === 'REFUNDED', 'payment marked refunded');
  ok((await call('GET', '/mentors/zainab-malik')).data.slots.some((s: any) => s.id === far[1].id), 'cancelled slot is bookable again');
  const rebook = await call('POST', '/bookings', { slotId: far[1].id, agenda: 'Leadership', ...prep }, sara);
  ok(rebook.status === 201, 'slot can be rebooked after cancellation');
  await webhook({ providerRef: rebook.data.payment.providerRef, status: 'succeeded' });

  // ---- late cancellation blocked; complete; review
  const soon = await prisma.availabilitySlot.create({ data: { mentorId: detail.data.id, startAt: new Date(Date.now() + 2 * 3600_000), endAt: new Date(Date.now() + 2.5 * 3600_000) } });
  const lateB = await call('POST', '/bookings', { slotId: soon.id, agenda: 'Other', ...prep }, racers[2]);
  await webhook({ providerRef: lateB.data.payment.providerRef, status: 'succeeded' });
  ok((await call('POST', `/bookings/${lateB.data.reference}/cancel`, {}, racers[2])).status === 400, 'student cancel inside notice window blocked');

  const past = await prisma.availabilitySlot.create({ data: { mentorId: detail.data.id, startAt: new Date(Date.now() - 3600_000), endAt: new Date(Date.now() - 1800_000), isBooked: true } });
  const sUser = (await call('GET', '/auth/me', undefined, sara)).data.id;
  const pb = await prisma.booking.create({ data: { reference: 'PBM-TEST' + run.slice(-3).toUpperCase(), studentId: sUser, mentorId: detail.data.id, slotId: past.id, agenda: 'Career guidance', ...prep, priceMinor: 150000, currency: 'PKR', status: 'CONFIRMED', meetingLink: 'x' } });
  const mentorLogin = await call('POST', '/auth/login', { email: 'zainab-malik@demo.pointb.example', password: 'Mentor#12345' });
  const mtok = mentorLogin.data.accessToken as string;
  ok(mentorLogin.data.user.role === 'MENTOR', 'mentor signs in');
  ok((await call('POST', `/bookings/${pb.reference}/complete`, {}, sara)).status === 403, 'student cannot complete a session');
  ok((await call('POST', `/bookings/${pb.reference}/complete`, {}, mtok)).data.status === 'COMPLETED', 'mentor completes session');
  ok((await call('POST', `/bookings/${pb.reference}/review`, { rating: 5, comment: 'Practical and direct advice.' }, sara)).data.review?.rating === 5, 'student leaves review');
  ok((await call('POST', `/bookings/${pb.reference}/review`, { rating: 4, comment: 'Second review attempt' }, sara)).status === 409, 'duplicate review rejected');
  const mb = await call('GET', '/mentors/me/bookings', undefined, mtok);
  ok(mb.status === 200 && mb.data.some((x: any) => x.currentSituation && x.studentName), 'mentor sees prep notes for own bookings');
  ok((await call('GET', '/mentors/zainab-malik')).data.rating === 5, 'mentor rating reflects verified review');

  // ---- safeguarding
  ok((await call('POST', '/auth/register', { name: 'Minor Kid', email: `kid.${run}@example.com`, password: 'Passw0rd!x', dateOfBirth: '2012-01-01' })).status === 400, 'under-18 needs guardian email');
  const kid = await call('POST', '/auth/register', { name: 'Minor Kid', email: `kid2.${run}@example.com`, password: 'Passw0rd!x', dateOfBirth: '2012-01-01', guardianEmail: `parent.${run}@example.com` });
  ok(kid.status === 201 && kid.data.user.isMinor, 'minor registers with guardian email');
  ok((await call('POST', '/bookings', { slotId: far[3].id, agenda: 'Career guidance', ...prep }, kid.data.accessToken)).status === 403, 'minor cannot book without guardian consent');

  // ---- recruitment
  const appBody = { fullName: 'Hira Khan', email: `hira.${run}@example.com`, phone: '+92 300 1112233', countryOfResidence: 'Pakistan', professionalLocation: 'Pakistan', linkedinUrl: 'https://linkedin.com/in/hira', headline: 'Marketing Lead, telecom operator', currentRole: 'Marketing Lead', organization: 'a telecom operator', yearsExperience: 9, industry: 'Marketing & Brand', specialistAreas: ['Brand'], qualifications: 'MBA', languages: ['English', 'Urdu'], previousMentorshipExperience: 'Informal', topicsOffered: ['Career guidance'], preferredPricing: 'Standard', weeklyAvailability: 'Evenings', motivation: 'I want to help students entering marketing roles.', participation: 'Paid', agreedToTerms: true };
  const app = await call('POST', '/applications', appBody);
  ok(app.status === 201 && app.data.status === 'SUBMITTED', 'mentor application submitted');
  ok((await call('POST', '/applications', appBody)).status === 400, 'duplicate open application blocked');
  ok((await call('POST', '/applications', { ...appBody, email: `x.${run}@example.com`, agreedToTerms: false })).status === 400, 'terms must be accepted');
  const admin = (await call('POST', '/auth/login', { email: 'admin@pointb.example', password: process.env.ADMIN_PASSWORD ?? 'Admin#12345' })).data.accessToken as string;
  ok(!!admin, 'admin signs in');
  const id = app.data.id as string;
  const st = (status: string, notes?: string) => call('PATCH', `/admin/applications/${id}/status`, { status, notes }, admin);
  ok((await st('APPROVED')).status === 400, 'cannot skip pipeline stages');
  for (const s of ['UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEW_SCHEDULED']) ok((await st(s)).status === 200, `moved to ${s}`);
  ok((await st('INTERVIEW_COMPLETED')).status === 200, 'moved to INTERVIEW_COMPLETED');
  ok((await st('APPROVED')).status === 400, 'approval blocked without scorecard');
  const low = await call('PUT', `/admin/applications/${id}/scorecard`, { experience: 15, expertise: 15, communication: 12, approach: 12, conduct: 6 }, admin);
  ok(low.data.total === 60 && low.data.meetsThreshold === false, 'scorecard totals 60, below threshold');
  ok((await st('APPROVED')).status === 400, 'below-threshold approval requires written justification');
  const good = await call('PUT', `/admin/applications/${id}/scorecard`, { experience: 21, expertise: 22, communication: 17, approach: 17, conduct: 9 }, admin);
  ok(good.data.total === 86 && good.data.meetsThreshold, 'updated scorecard totals 86');
  ok((await call('PUT', `/admin/applications/${id}/scorecard`, { experience: 40, expertise: 1, communication: 1, approach: 1, conduct: 1 }, admin)).status === 400, 'scorecard range validated');
  ok((await st('APPROVED')).status === 200, 'approved after passing score (explicit decision)');
  const onb = await st('ONBOARDING');
  ok(onb.status === 200 && typeof onb.data.temporaryPassword === 'string', 'onboarding creates mentor account');
  ok((await st('ACTIVE')).status === 400, 'activation blocked until identity verified');
  await call('PATCH', `/admin/applications/${id}/identity`, { verified: true }, admin);
  ok((await st('ACTIVE')).status === 400, 'activation blocked until mentor agreement accepted');
  const hira = await call('POST', '/auth/login', { email: appBody.email, password: onb.data.temporaryPassword });
  ok(hira.data.user?.role === 'MENTOR', 'new mentor signs in with temporary password');
  const ht = hira.data.accessToken as string;
  ok((await call('GET', '/mentors/hira-khan')).status === 404, 'onboarding profile is not public');
  ok((await call('POST', '/mentors/me/agreement', {}, ht)).status === 201, 'mentor accepts agreement');
  const t1 = new Date(Date.now() + 5 * 86400_000); t1.setUTCHours(10, 0, 0, 0);
  ok((await call('POST', '/mentors/me/slots', { startTimes: [t1.toISOString(), new Date(t1.getTime() + 1800_000).toISOString()] }, ht)).data.created === 2, 'mentor publishes availability');
  ok((await call('POST', '/mentors/me/slots', { startTimes: [new Date(t1.getTime() + 600_000).toISOString()] }, ht)).status === 400, 'off-grid slot rejected');
  ok((await st('ACTIVE')).status === 200, 'admin activates mentor');
  const pub = await call('GET', '/mentors/hira-khan');
  ok(pub.status === 200 && pub.data.slots.length === 2 && pub.data.verified && pub.data.currency === 'PKR' && pub.data.priceMinor === 100000, 'profile now public with live slots and tier price');
  ok((await call('POST', `/bookings`, { slotId: pub.data.slots[0].id, agenda: 'Career guidance', ...prep }, ht)).status === 403, 'mentor role cannot create student bookings');

  // ---- admin controls
  const ov = await call('PATCH', `/admin/mentors/${pub.data.id}`, { priceOverrideMinor: 120000, level: 'SENIOR_SPECIALIST' }, admin);
  ok(ov.data.priceMinor === 120000, 'admin price override applies');
  await call('PATCH', `/admin/mentors/${pub.data.id}`, { priceOverrideMinor: null }, admin);
  ok((await call('GET', '/mentors/hira-khan')).data.priceMinor === 150000, 'clearing override returns to tier price');
  await call('PUT', '/admin/pricing', { level: 'PROFESSIONAL', currency: 'PKR', priceMinor: 100000 }, admin);
  ok((await call('PUT', '/admin/settings', { key: 'commission_percent', value: '150' }, admin)).status === 400, 'commission validated');
  const stats0 = await call('GET', '/admin/stats', undefined, admin);
  ok(stats0.data.commissionConfigured === false && stats0.data.finance[0].platformRevenueMinor === null, 'commission not invented when unset');
  await call('PUT', '/admin/settings', { key: 'commission_percent', value: '20' }, admin);
  const stats = await call('GET', '/admin/stats', undefined, admin);
  ok(stats.data.finance[0].platformRevenueMinor > 0 && stats.data.activeMentors >= 7, 'stats compute revenue once commission configured');
  ok((await call('PATCH', `/admin/mentors/${pub.data.id}`, { status: 'SUSPENDED' }, admin)).status === 200 && (await call('GET', '/mentors/hira-khan')).status === 404, 'suspended mentor disappears from directory');
  const log = await call('GET', '/admin/audit-log', undefined, admin);
  ok(log.data.length > 10, `admin actions are audit-logged (${log.data.length} entries)`);
  ok((await call('GET', '/admin/outbox', undefined, admin)).data.some((n: any) => /live|Welcome to POINT B Mentors — next steps/.test(n.subject)), 'notification outbox records applicant emails');

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
