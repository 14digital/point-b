import 'dotenv/config';

const BASE = process.env.API ?? 'http://localhost:4000/api';
let pass = 0, fail = 0;
const ok = (c: unknown, name: string) => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${name}`); };
async function call(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  let data: any; try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}
const prep = { currentSituation: 'Final-year student choosing between offers', usefulOutcome: 'A clearer way to compare the two roles' };

async function main() {
  const run = Date.now().toString(36);
  const mt = (await call('POST', '/auth/login', { email: 'zainab-malik@demo.pointb.example', password: 'Mentor#12345' })).data.accessToken;
  const t = new Date(Date.now() + (3 + Math.floor(Math.random() * 40)) * 86400_000); t.setUTCHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 2) * 30, 0, 0);
  const t2 = new Date(t.getTime() + 1800_000);
  ok((await call('POST', '/mentors/me/slots', { startTimes: [t.toISOString()], kind: 'GROUP', capacity: 3 }, mt)).data.created === 1, 'mentor publishes a 3-seat group slot');
  ok((await call('POST', '/mentors/me/slots', { startTimes: [t2.toISOString()], kind: 'GROUP', capacity: 1 }, mt)).status === 400, 'group capacity below 2 rejected');
  const d = await call('GET', '/mentors/zainab-malik');
  const g = d.data.slots.find((s: any) => s.startAt === t.toISOString());
  ok(g && g.kind === 'GROUP' && g.capacity === 3 && g.seatsLeft === 3, 'group slot listed with seats');
  ok(d.data.groupPriceMinor < d.data.priceMinor && d.data.groupPriceMinor === Math.round(d.data.priceMinor * 0.4 / 100) * 100, 'group seat cheaper than 1:1 (40%)');

  const studs = await Promise.all(['a', 'b', 'c', 'd', 'e'].map(async (n) => (await call('POST', '/auth/register', { name: `Grp ${n}`, email: `grp.${n}.${run}@example.com`, password: 'Passw0rd!x' })).data.accessToken as string));
  const res = await Promise.all(studs.map((s) => call('POST', '/bookings', { slotId: g.id, agenda: 'Career guidance', ...prep }, s)));
  const won = res.filter((r) => r.status === 201), lost = res.filter((r) => r.status === 409);
  ok(won.length === 3 && lost.length === 2, `5 racers, 3 seats: exactly 3 win (wins=${won.length}, conflicts=${lost.length})`);
  ok(won.every((r) => r.data.sessionKind === 'GROUP' && r.data.priceMinor === d.data.groupPriceMinor), 'seats booked at group price');
  const after = (await call('GET', '/mentors/zainab-malik')).data.slots.find((s: any) => s.id === g.id);
  ok(!after, 'full group slot disappears from public list');
  const winner = studs[res.findIndex((r) => r.status === 201)];
  const wref = res.find((r) => r.status === 201)!.data.reference;
  ok((await call('POST', '/bookings', { slotId: g.id, agenda: 'Career guidance', ...prep }, winner)).status === 409, 'full slot rejects further bookings');
  ok((await call('POST', `/bookings/${wref}/cancel`, {}, winner)).status === 201, 'student releases a held seat');
  const back = (await call('GET', '/mentors/zainab-malik')).data.slots.find((s: any) => s.id === g.id);
  ok(back && back.seatsLeft === 1, 'released seat reopens (1 left)');
  ok((await call('POST', '/bookings', { slotId: g.id, agenda: 'Career guidance', ...prep }, studs[res.findIndex((r) => r.status === 409)])).status === 201, 'next student takes the freed seat');
  ok((await call('DELETE', `/mentors/me/slots/${g.id}`, undefined, mt)).status === 409, 'mentor cannot delete a slot with seats taken');
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main();
