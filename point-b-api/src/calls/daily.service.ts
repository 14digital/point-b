import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

/** Thin client for the Daily.co REST API (rooms, meeting tokens, presence). Needs DAILY_API_KEY. */
@Injectable()
export class DailyService {
  private log = new Logger('Daily');

  enabled() { return !!process.env.DAILY_API_KEY; }

  private async req(method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> {
    const res = await fetch('https://api.daily.co/v1' + path, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.DAILY_API_KEY}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  }

  /** Returns the room URL, creating a private room on first use. The room expires an hour after the session ends. */
  async ensureRoom(name: string, endAt: Date, maxParticipants: number): Promise<string> {
    const existing = await this.req('GET', `/rooms/${name}`);
    if (existing.status === 200) return existing.data.url;
    const created = await this.req('POST', '/rooms', {
      name,
      privacy: 'private',
      properties: {
        exp: Math.floor((endAt.getTime() + 60 * 60_000) / 1000),
        max_participants: maxParticipants,
        enable_chat: true,
        enable_screenshare: true,
        enable_prejoin_ui: true,
        enable_network_ui: true,
        eject_at_room_exp: true,
      },
    });
    if (created.status >= 400) {
      // Two people opening the room at once: the loser re-reads the winner's room.
      const again = await this.req('GET', `/rooms/${name}`);
      if (again.status === 200) return again.data.url;
      this.log.error(`create room failed (${created.status}): ${JSON.stringify(created.data)}`);
      throw new ServiceUnavailableException('Could not start the video room. Please try again in a moment.');
    }
    return created.data.url;
  }

  /** A personal, time-limited token. Owners (the mentor) can moderate: mute, remove, end the call. */
  async token(room: string, o: { userId: string; userName: string; owner: boolean; startAt: Date; endAt: Date }): Promise<string> {
    const r = await this.req('POST', '/meeting-tokens', {
      properties: {
        room_name: room,
        user_id: o.userId,
        user_name: o.userName,
        is_owner: o.owner,
        // Backstop for the API's own check: the token only works from 10 minutes before the start.
        nbf: Math.floor((o.startAt.getTime() - 10 * 60_000) / 1000),
        exp: Math.floor((o.endAt.getTime() + 60 * 60_000) / 1000),
        enable_screenshare: true,
        start_video_off: false,
        start_audio_off: false,
      },
    });
    if (r.status >= 400 || !r.data?.token) {
      this.log.error(`meeting token failed (${r.status}): ${JSON.stringify(r.data)}`);
      throw new ServiceUnavailableException('Could not create your join link. Please try again.');
    }
    return r.data.token;
  }

  /** Whether the given user id is currently in the room: 'unknown' if Daily could not tell (room missing, API error). */
  async presence(room: string, who: string | ((userId: string) => boolean)): Promise<'yes' | 'no' | 'unknown'> {
    try {
      const r = await this.req('GET', `/rooms/${room}/presence`);
      if (r.status !== 200) return 'unknown';
      const list: { userId?: string }[] = Array.isArray(r.data) ? r.data : (r.data?.data ?? []);
      return list.some((p) => !!p.userId && (typeof who === 'string' ? p.userId === who : who(p.userId))) ? 'yes' : 'no';
    } catch {
      return 'unknown';
    }
  }

  private usageCache?: { at: number; minutes: number };

  /**
   * Participant-minutes Daily has recorded across every meeting, which is what its plan allowance is measured in.
   * Each participant's time is rounded up to a whole minute, as billing does. Cached for a minute. null if Daily cannot say.
   */
  async usedMinutes(): Promise<number | null> {
    if (!this.enabled()) return null;
    if (this.usageCache && Date.now() - this.usageCache.at < 60_000) return this.usageCache.minutes;
    try {
      let minutes = 0, after: string | undefined;
      for (let page = 0; page < 50; page++) {
        const r = await this.req('GET', `/meetings?limit=100${after ? `&starting_after=${after}` : ''}`);
        if (r.status !== 200 || !Array.isArray(r.data?.data)) return null;
        const rows: { id: string; participants?: { duration?: number }[] }[] = r.data.data;
        for (const m of rows) for (const p of m.participants ?? []) minutes += Math.ceil((p.duration ?? 0) / 60);
        if (rows.length < 100) break;
        after = rows[rows.length - 1].id;
      }
      this.usageCache = { at: Date.now(), minutes };
      return minutes;
    } catch {
      return null;
    }
  }
}
