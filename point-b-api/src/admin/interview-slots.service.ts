import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InterviewSlotSettingsDto } from './admin.dto';

export const INTERVIEW_MINUTES = 30;
/** Longest interview ever booked: how far back to look for one still running at a slot's start. */
const LONGEST_INTERVIEW_MIN = 120;
const SETTING_KEY = 'interview_slots';
const MAX_DAYS = 31;

export interface SlotSettings {
  timezone: string;
  /** Half-hour start times ("13:30") offered on each weekday. Index 0 is Sunday. */
  weekly: string[][];
}

interface CalendarSlot { time: string; startAt: string; state: 'open' | 'taken' | 'current'; takenBy?: string }

const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i);
const pad = (n: number) => String(n).padStart(2, '0');
const WEEKDAY_DEFAULT = range(13, 17).flatMap((h) => [`${pad(h)}:00`, `${pad(h)}:30`]);
/** Used until an admin saves their own: Monday to Friday, 1pm to 5pm, Pakistan time. */
const DEFAULT_SETTINGS: SlotSettings = { timezone: 'Asia/Karachi', weekly: [[], ...range(0, 5).map(() => WEEKDAY_DEFAULT), []] };

const validTimezone = (tz: string) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } };

/** The wall-clock date, time and weekday of an instant in a timezone. */
function localParts(at: Date, timezone: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(at).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, second: Number(p.second) };
}

/** The instant a wall-clock time happens in a timezone, or null if clocks skip it (daylight saving). */
export function zonedToUtc(date: string, time: string, timezone: string): Date | null {
  const wall = Date.parse(`${date}T${time}:00Z`);
  let at = new Date(wall);
  // The offset depends on the instant, so correct twice to settle across a daylight-saving change.
  for (let i = 0; i < 2; i++) {
    const l = localParts(at, timezone);
    at = new Date(at.getTime() + wall - Date.parse(`${l.date}T${l.time}:00Z`));
  }
  const l = localParts(at, timezone);
  return l.date === date && l.time === time ? at : null;
}

const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

@Injectable()
export class InterviewSlotsService {
  constructor(private prisma: PrismaService) {}

  async settings(): Promise<SlotSettings> {
    const row = await this.prisma.setting.findUnique({ where: { key: SETTING_KEY } });
    if (!row) return DEFAULT_SETTINGS;
    try { return JSON.parse(row.value) as SlotSettings; } catch { return DEFAULT_SETTINGS; }
  }

  async saveSettings(dto: InterviewSlotSettingsDto): Promise<SlotSettings> {
    if (!validTimezone(dto.timezone)) throw new BadRequestException('Choose a valid timezone');
    if (dto.weekly.some((day) => day.some((t) => !/^([01]\d|2[0-3]):(00|30)$/.test(t)))) throw new BadRequestException('Slots must start on the hour or half hour');
    const value: SlotSettings = { timezone: dto.timezone, weekly: dto.weekly.map((day) => [...new Set(day)].sort()) };
    await this.prisma.setting.upsert({ where: { key: SETTING_KEY }, create: { key: SETTING_KEY, value: JSON.stringify(value) }, update: { value: JSON.stringify(value) } });
    return value;
  }

  /** Slots still to come for each day, each marked open, taken by another interview, or this application's current one. */
  async calendar(from: string | undefined, days: number, applicationId?: string) {
    const { timezone, weekly } = await this.settings();
    const today = localParts(new Date(), timezone).date;
    const start = from && /^\d{4}-\d{2}-\d{2}$/.test(from) && !Number.isNaN(Date.parse(from)) && from > today ? from : today;
    const count = Math.min(Math.max(Math.trunc(days) || 7, 1), MAX_DAYS);
    const dates = range(0, count).map((i) => addDays(start, i));

    const windowStart = new Date(Date.parse(`${start}T00:00:00Z`) - 86_400_000 - LONGEST_INTERVIEW_MIN * 60_000);
    const windowEnd = new Date(Date.parse(`${addDays(start, count)}T00:00:00Z`) + 86_400_000);
    const booked = await this.prisma.mentorApplication.findMany({
      where: { status: 'INTERVIEW_SCHEDULED', interviewAt: { gte: windowStart, lt: windowEnd } },
      select: { id: true, fullName: true, interviewAt: true, interviewDurationMin: true },
    });

    const now = Date.now();
    return {
      timezone,
      configured: weekly.some((d) => d.length > 0),
      days: dates.map((date) => ({
        date,
        slots: weekly[weekdayOf(date)].flatMap((time): CalendarSlot[] => {
          const at = zonedToUtc(date, time, timezone);
          if (!at || at.getTime() <= now) return [];
          const end = at.getTime() + INTERVIEW_MINUTES * 60_000;
          const overlap = booked.filter((b) => b.interviewAt!.getTime() < end && b.interviewAt!.getTime() + (b.interviewDurationMin ?? INTERVIEW_MINUTES) * 60_000 > at.getTime());
          const other = overlap.find((b) => b.id !== applicationId);
          const startAt = at.toISOString();
          if (other) return [{ time, startAt, state: 'taken', takenBy: other.fullName }];
          if (overlap.some((b) => b.interviewAt!.getTime() === at.getTime())) return [{ time, startAt, state: 'current' }];
          return [{ time, startAt, state: 'open' }];
        }),
      })),
    };
  }

  /** Refuses a start time that isn't one of the slots the admin offers. */
  async assertOffered(start: Date) {
    const { timezone, weekly } = await this.settings();
    const l = localParts(start, timezone);
    if (l.second !== 0 || start.getUTCMilliseconds() !== 0 || !weekly[weekdayOf(l.date)].includes(l.time)) {
      throw new BadRequestException('That slot is no longer offered. Pick another.');
    }
  }
}
