"use client";

import { PhoneInput, type CountryCode } from "./phone-input";

export const WhatsAppIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={`shrink-0 ${className}`}>
    <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.5h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.07.15.2 2.1 3.2 5.08 4.49.71.3 1.27.49 1.7.63.72.23 1.37.2 1.88.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.28.17-1.41-.07-.13-.27-.2-.57-.35zM12.05 21.5h-.01a9.4 9.4 0 01-4.8-1.31l-.34-.2-3.57.93.95-3.48-.22-.36a9.4 9.4 0 01-1.44-5.02c0-5.2 4.23-9.43 9.44-9.43 2.52 0 4.89.98 6.67 2.77a9.37 9.37 0 012.76 6.67c0 5.2-4.23 9.43-9.44 9.43zm8.03-17.46A11.3 11.3 0 0012.05.7C5.8.7.7 5.8.7 12.05c0 2 .52 3.95 1.52 5.67L.6 23.3l5.72-1.5a11.33 11.33 0 005.72 1.46h.01c6.25 0 11.35-5.09 11.35-11.35 0-3.03-1.18-5.88-3.32-8.02z" />
  </svg>
);

/** Mobile number with a country picker, plus the choice to get alerts on WhatsApp as well as email. */
export function MobileField({ id = "mobile", value, onChange, iso, onIso, whatsapp, onWhatsapp, error }: {
  id?: string; value: string; onChange: (v: string) => void; iso: CountryCode; onIso: (iso: CountryCode) => void;
  whatsapp: boolean; onWhatsapp: (v: boolean) => void; error?: string | null;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">Mobile number</label>
      <PhoneInput id={id} value={value} iso={iso} onIso={onIso} onChange={onChange} invalid={!!error} />
      {error && <p className="mt-1.5 text-xs text-rust">{error}</p>}
      <label className={`mt-2.5 flex cursor-pointer items-start gap-3 rounded-xl px-3.5 py-3 text-sm transition-colors ${whatsapp ? "bg-[#25D366]/10 ring-1 ring-[#25D366]/30" : "bg-paper ring-1 ring-line"}`}>
        <input type="checkbox" className="sr-only" checked={whatsapp} onChange={(e) => onWhatsapp(e.target.checked)} />
        <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${whatsapp ? "border-[#1fa855] bg-[#1fa855] text-white" : "border-ink/25 bg-white"}`} aria-hidden>
          {whatsapp && <svg width="11" height="11" viewBox="0 0 20 20" fill="none"><path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 font-medium text-ink"><WhatsAppIcon className="h-4 w-4 text-[#1fa855]" />Get my alerts on WhatsApp too</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">Booking confirmations, reminders before each call and updates, as well as email. Turn off any time.</span>
        </span>
      </label>
    </div>
  );
}
