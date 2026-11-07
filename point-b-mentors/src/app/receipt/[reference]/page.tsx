"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Alert, Button, Container, Skeleton } from "@/components/ui";
import { Logo } from "@/components/logo";
import { useAuth } from "@/lib/auth";
import { fmtDay, fmtTime, formatMoney } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import type { Booking } from "@/lib/types";

const PAID = ["CONFIRMED", "COMPLETED", "NO_SHOW"];

/** A printable receipt for a paid session, for the student's records or an employer's expense claim. */
export default function ReceiptPage() {
  const { reference } = useParams<{ reference: string }>();
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !user) router.replace(`/sign-in?next=${encodeURIComponent(`/receipt/${reference}`)}`);
  }, [loading, user, reference, router]);
  const b = useApi<Booking>(user ? `/bookings/${reference}` : null);

  if (loading || !user || (b.loading && !b.data)) return <Container className="py-12"><Skeleton className="mx-auto h-[32rem] max-w-2xl rounded-3xl" /></Container>;
  if (b.error || !b.data) return <Container className="py-12"><div className="mx-auto max-w-2xl"><Alert>{b.error ?? "Receipt not found"}</Alert></div></Container>;
  const d = b.data;
  const refunded = d.payment?.status === "REFUNDED";
  if (!PAID.includes(d.status) && !refunded) return <Container className="py-12"><div className="mx-auto max-w-2xl"><Alert tone="info">A receipt is available once this session has been paid.</Alert></div></Container>;

  const paidOn = d.payment?.processedAt ?? d.createdAt;
  const method = d.payment?.provider === "wallet" ? "POINT B balance" : d.payment?.bankSubmittedAt ? "Bank transfer / QR" : d.payment?.provider === "stripe" ? "Card" : d.payment?.provider === "mock" ? "Demo checkout" : "Online payment";
  const list = d.listPriceMinor ?? d.priceMinor, discount = d.discountMinor ?? 0;

  return (
    <Container className="py-10 print:py-0">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
          <a href={user.role === "ADMIN" ? "/admin?tab=bookings" : "/dashboard/student"} className="text-sm text-ink-soft underline-offset-4 hover:text-ink hover:underline">← Back</a>
          <Button size="sm" onClick={() => window.print()}>Print or save as PDF</Button>
        </div>
        <article className="rounded-[28px] bg-white p-6 ring-1 ring-line sm:p-10 print:rounded-none print:p-0 print:ring-0">
          <header className="flex flex-wrap items-start justify-between gap-6 border-b border-line pb-6">
            <div><Logo /><p className="mt-3 text-xs text-ink-soft">POINT B Mentors</p></div>
            <div className="sm:text-right">
              <p className="font-display text-3xl text-ink">{refunded ? "Credit note" : "Receipt"}</p>
              <p className="mt-1 font-mono text-sm text-ink">{d.reference}</p>
              <p className="text-xs text-ink-soft">{refunded ? "Credited to balance" : "Paid"} {fmtDay(paidOn)}</p>
            </div>
          </header>
          <section className="grid gap-6 py-6 sm:grid-cols-2">
            <div><p className="text-xs uppercase tracking-[0.12em] text-ink-soft">Billed to</p><p className="mt-1 font-medium text-ink">{d.student?.name ?? user.name}</p>{!d.student && <p className="text-sm text-ink-soft">{user.email}</p>}</div>
            <div className="sm:text-right"><p className="text-xs uppercase tracking-[0.12em] text-ink-soft">Payment</p><p className="mt-1 text-ink">{method}</p>{d.payment?.bankTxnRef && <p className="font-mono text-xs text-ink-soft">{d.payment.bankTxnRef}</p>}</div>
          </section>
          <table className="w-full text-sm">
            <thead><tr className="border-y border-line text-left text-xs text-ink-soft"><th className="py-2.5 font-medium">Description</th><th className="py-2.5 text-right font-medium">Amount</th></tr></thead>
            <tbody>
              <tr className="border-b border-line/70 align-top">
                <td className="py-4 pr-4"><p className="font-medium text-ink">{d.sessionKind === "GROUP" ? "Group mentoring session (one seat)" : "1:1 mentoring session, 30 minutes"}</p><p className="text-ink-soft">with {d.mentor.name} · {fmtDay(d.startAt)}, {fmtTime(d.startAt)}</p><p className="text-ink-soft">Focus: {d.agenda}</p></td>
                <td className="whitespace-nowrap py-4 text-right tabular-nums text-ink">{formatMoney(list, d.currency)}</td>
              </tr>
              {discount > 0 && <tr className="border-b border-line/70"><td className="py-3 text-ink-soft">Promo discount</td><td className="whitespace-nowrap py-3 text-right tabular-nums text-ink">− {formatMoney(discount, d.currency)}</td></tr>}
              {!!d.walletAppliedMinor && d.payment?.provider !== "wallet" && <tr className="border-b border-line/70"><td className="py-3 text-ink-soft">Paid from POINT B balance</td><td className="whitespace-nowrap py-3 text-right tabular-nums text-ink">{formatMoney(d.walletAppliedMinor, d.currency)}</td></tr>}
            </tbody>
            <tfoot><tr><td className="pt-4 font-medium text-ink">{refunded ? "Credited to POINT B balance" : "Total"}</td><td className="whitespace-nowrap pt-4 text-right font-display text-2xl tabular-nums text-ink sm:text-3xl">{formatMoney(d.priceMinor, d.currency)}</td></tr></tfoot>
          </table>
          <footer className="mt-10 border-t border-line pt-5 text-xs leading-relaxed text-ink-soft">
            Questions about this receipt? Contact us through the Contact page and quote <span className="whitespace-nowrap">{d.reference}</span>. Prices are for a single mentoring session and include any applicable charges.
          </footer>
        </article>
      </div>
    </Container>
  );
}
