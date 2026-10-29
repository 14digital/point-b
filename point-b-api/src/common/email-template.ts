export interface EmailOptions {
  /** Address that replies go to (e.g. the person who filled in the contact form). */
  replyTo?: string;
  /** One prominent button, e.g. "Join your session". */
  cta?: { label: string; url: string };
  /** Key facts shown in a small table (mentor, date, reference). */
  facts?: [string, string][];
}

export const webUrl = () => (process.env.WEB_URL ?? process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(',')[0].trim().replace(/\/$/, '');

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** "Friday 30 October 2026, 5:00 pm" in UTC, clearly labelled. */
export const emailDate = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' }).format(d).replace(/\bam\b/, 'am').replace(/\bpm\b/, 'pm') + ' UTC';

const BRASS = '#8a6a2f', INK = '#17181c', SOFT = '#5c5f66', LINE = '#e6e2d8', PAPER = '#faf8f3';

/** Branded HTML email. Inline styles and tables only, so it renders in Gmail, Outlook and Apple Mail. */
export function renderEmail(subject: string, body: string, opts: EmailOptions = {}): { html: string; text: string } {
  const site = webUrl();
  const logo = process.env.EMAIL_LOGO_URL
    ? `<img src="${esc(process.env.EMAIL_LOGO_URL)}" alt="POINT B Mentors" height="34" style="display:block;border:0;height:34px;">`
    : `<span style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:${INK};letter-spacing:-0.2px;">POINT B <span style="color:${BRASS};">Mentors</span></span>`;

  const paragraphs = body.trim().split(/\n{2,}/).map((p) =>
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${INK};">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');

  const facts = opts.facts?.length
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:8px 0 20px;border:1px solid ${LINE};border-radius:10px;background:${PAPER};">${opts.facts.map(([k, v], i) =>
        `<tr><td style="padding:10px 16px;font-size:13px;color:${SOFT};width:38%;${i ? `border-top:1px solid ${LINE};` : ''}">${esc(k)}</td><td style="padding:10px 16px;font-size:14px;color:${INK};${i ? `border-top:1px solid ${LINE};` : ''}">${esc(v)}</td></tr>`).join('')}</table>`
    : '';

  const cta = opts.cta
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 24px;"><tr><td style="border-radius:999px;background:${INK};"><a href="${esc(opts.cta.url)}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">${esc(opts.cta.label)}</a></td></tr></table>`
    : '';

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${PAPER};">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${PAPER};padding:28px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid ${LINE};border-radius:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<tr><td style="padding:26px 32px 18px;border-bottom:1px solid ${LINE};"><a href="${esc(site)}" style="text-decoration:none;">${logo}</a></td></tr>
<tr><td style="padding:28px 32px 8px;">
<h1 style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:normal;line-height:1.3;color:${INK};">${esc(subject)}</h1>
${paragraphs}${facts}${cta}
</td></tr>
<tr><td style="padding:20px 32px 28px;border-top:1px solid ${LINE};font-size:12px;line-height:1.6;color:${SOFT};">
<a href="${esc(site)}" style="color:${BRASS};text-decoration:none;font-weight:600;">${esc(site.replace(/^https?:\/\//, ''))}</a><br>
Private 30-minute conversations with experienced professionals.<br>
Questions? <a href="${esc(site)}/contact" style="color:${SOFT};">Contact support</a> · <a href="${esc(site)}/legal" style="color:${SOFT};">Terms, privacy &amp; refunds</a><br>
<span style="color:#9a9da4;">You are receiving this because of activity on your POINT B Mentors account.</span>
</td></tr>
</table></td></tr></table></body></html>`;

  const text = [body.trim(), opts.facts?.map(([k, v]) => `${k}: ${v}`).join('\n'), opts.cta ? `${opts.cta.label}: ${opts.cta.url}` : '', `POINT B Mentors · ${site}`].filter(Boolean).join('\n\n');
  return { html, text };
}
