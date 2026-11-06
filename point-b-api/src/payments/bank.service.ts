import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../common/notifications.service';
import { emailDate, webUrl } from '../common/email-template';
import { AuthUser } from '../common/auth';
import { HOLD_MINUTES } from '../bookings/bookings.service';
import { ActivityService } from '../activity/activity.service';
import { PaymentsService } from './payments.service';
import { BankSettingsDto, BankTransferDto } from './bank.dto';

export interface BankDetails { enabled: boolean; accountTitle: string; bankName: string; accountNumber?: string; iban?: string; raastId?: string }
const DETAILS = 'bank_details', QR = 'bank_qr';
const money = (minor: number) => `Rs ${(minor / 100).toLocaleString('en-PK')}`;

/**
 * Pay by bank app / QR code (Raast) for PKR sessions. The student transfers the exact amount, then sends the
 * transaction ID; an admin checks it against the bank statement and approves or rejects. Nothing is confirmed
 * automatically, and the slot stays held while the transfer is being checked.
 */
@Injectable()
export class BankTransferService {
  constructor(private prisma: PrismaService, private notify: NotificationsService, private payments: PaymentsService, private activity: ActivityService) {}

  async details(): Promise<BankDetails | null> {
    const row = await this.prisma.setting.findUnique({ where: { key: DETAILS } });
    try { return row ? (JSON.parse(row.value) as BankDetails) : null; } catch { return null; }
  }

  async qr(): Promise<{ type: string; data: Buffer } | null> {
    const row = await this.prisma.setting.findUnique({ where: { key: QR } });
    const m = row?.value.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
    return m ? { type: m[1], data: Buffer.from(m[2], 'base64') } : null;
  }

  async adminSettings() {
    const d = await this.details();
    const hasQr = !!(await this.prisma.setting.findUnique({ where: { key: QR }, select: { key: true } }));
    return { enabled: false, accountTitle: '', bankName: '', accountNumber: '', iban: '', raastId: '', ...d, hasQr };
  }

  async saveSettings(adminId: string, dto: BankSettingsDto) {
    const { qrImage, ...rest } = dto;
    const hasQr = qrImage === undefined ? !!(await this.prisma.setting.findUnique({ where: { key: QR }, select: { key: true } })) : qrImage !== '';
    if (rest.enabled && (!rest.accountTitle.trim() || !rest.bankName.trim())) throw new BadRequestException('Add the account title and bank name before turning bank payments on.');
    if (rest.enabled && !hasQr && !rest.accountNumber?.trim() && !rest.iban?.trim() && !rest.raastId?.trim()) throw new BadRequestException('Add a QR code or at least one account number, IBAN or Raast ID.');
    const value = JSON.stringify({ ...rest, accountTitle: rest.accountTitle.trim(), bankName: rest.bankName.trim(), accountNumber: rest.accountNumber?.trim(), iban: rest.iban?.trim().toUpperCase(), raastId: rest.raastId?.trim() });
    await this.prisma.setting.upsert({ where: { key: DETAILS }, create: { key: DETAILS, value }, update: { value } });
    if (qrImage === '') await this.prisma.setting.deleteMany({ where: { key: QR } });
    else if (qrImage) await this.prisma.setting.upsert({ where: { key: QR }, create: { key: QR, value: qrImage }, update: { value: qrImage } });
    await this.prisma.auditLog.create({ data: { adminId, action: 'BANK_PAYMENT_SETTINGS', entityType: 'Setting', entityId: DETAILS, detail: `enabled=${rest.enabled}` } });
    return this.adminSettings();
  }

  /** The student says they've paid by bank transfer: record the details and hold the slot until an admin checks it. */
  async submit(user: AuthUser, reference: string, dto: BankTransferDto) {
    if (!(await this.details())?.enabled) throw new BadRequestException('Bank payments are not available right now.');
    const b = await this.prisma.booking.findUnique({ where: { reference }, include: { payments: { orderBy: { createdAt: 'desc' }, take: 1 }, mentor: { select: { user: { select: { name: true } } } }, student: { select: { name: true, email: true } }, slot: { select: { startAt: true } } } });
    if (!b || b.studentId !== user.id) throw new NotFoundException('Booking not found');
    if (b.status !== 'PENDING_PAYMENT') throw new BadRequestException('This booking is no longer waiting for payment.');
    if (b.currency !== 'PKR') throw new BadRequestException('Bank transfer is available for sessions priced in PKR.');
    if (!b.awaitingVerification && b.createdAt.getTime() + HOLD_MINUTES * 60_000 < Date.now()) throw new BadRequestException('This booking hold has expired. Please choose a time again.');
    const p = b.payments[0];
    if (!p) throw new NotFoundException('Payment not found');
    await this.prisma.$transaction([
      this.prisma.payment.update({ where: { id: p.id }, data: { bankTxnRef: dto.txnRef.trim(), bankSenderName: dto.senderName.trim(), bankSubmittedAt: new Date(), reviewedAt: null, reviewNote: null } }),
      this.prisma.booking.update({ where: { id: b.id }, data: { awaitingVerification: true } }),
    ]);
    const first = b.student.name.split(' ')[0];
    const facts: [string, string][] = [['Amount', money(p.amountMinor)], ['Transaction ID', dto.txnRef.trim()], ['Session', `${b.mentor.user.name}, ${emailDate(b.slot.startAt)}`], ['Reference', b.reference]];
    await this.notify.send(b.student.email, 'We have received your payment details', `Hi ${first},\n\nThank you. We have your bank transfer details and are checking the payment now. Your session time is held for you while we do. You will get a confirmation as soon as it is verified, usually within a few hours.`, b.studentId, { facts, whatsapp: { alert: 'paymentReceived', params: [first, b.mentor.user.name, money(p.amountMinor), dto.txnRef.trim(), b.reference] } });
    const inbox = process.env.SUPPORT_EMAIL ?? process.env.MAIL_FROM_ADDRESS ?? process.env.SMTP_USER;
    this.activity.record(user.id, 'bank_transfer_submitted', { reference: b.reference });
    if (inbox) await this.notify.send(inbox, `Bank payment to verify: ${b.reference}`, `${b.student.name} says they paid ${money(p.amountMinor)} by bank transfer. Check it against the bank statement, then approve or reject it in the admin Overview.`, undefined, { cta: { label: 'Open admin', url: `${webUrl()}/admin` }, facts: [...facts, ['Sender name', dto.senderName.trim()]], emailOnly: true });
    return { ok: true };
  }

  async pending() {
    const rows = await this.prisma.payment.findMany({
      where: { bankSubmittedAt: { not: null }, status: 'PENDING', booking: { status: 'PENDING_PAYMENT', awaitingVerification: true } },
      orderBy: { bankSubmittedAt: 'asc' },
      include: { booking: { select: { reference: true, sessionKind: true, slot: { select: { startAt: true } }, student: { select: { name: true, email: true } }, mentor: { select: { user: { select: { name: true } } } } } } },
    });
    return rows.map((p) => ({
      id: p.id, amountMinor: p.amountMinor, currency: p.currency, txnRef: p.bankTxnRef, senderName: p.bankSenderName, submittedAt: p.bankSubmittedAt,
      reference: p.booking.reference, sessionKind: p.booking.sessionKind, startAt: p.booking.slot.startAt, studentName: p.booking.student.name, studentEmail: p.booking.student.email, mentorName: p.booking.mentor.user.name,
    }));
  }

  private async pendingPayment(id: string) {
    const p = await this.prisma.payment.findUnique({ where: { id }, include: { booking: { include: { student: { select: { name: true, email: true } }, mentor: { select: { user: { select: { name: true } } } }, slot: { select: { startAt: true } } } } } });
    if (!p || !p.bankSubmittedAt) throw new NotFoundException('Bank payment not found');
    if (p.status !== 'PENDING' || p.booking.status !== 'PENDING_PAYMENT') throw new BadRequestException('This payment has already been dealt with.');
    return p;
  }

  async approve(adminId: string, id: string) {
    const p = await this.pendingPayment(id);
    await this.prisma.payment.update({ where: { id }, data: { provider: 'bank', reviewedAt: new Date(), reviewedBy: adminId } });
    await this.prisma.booking.update({ where: { id: p.bookingId }, data: { awaitingVerification: false } });
    await this.payments.applyResult(p.providerRef, 'succeeded'); // confirms the booking and sends the usual confirmation emails
    await this.prisma.auditLog.create({ data: { adminId, action: 'BANK_PAYMENT_APPROVED', entityType: 'Payment', entityId: id, detail: `${p.booking.reference} txn=${p.bankTxnRef}` } });
    return this.pending();
  }

  async reject(adminId: string, id: string, reason: string) {
    const p = await this.pendingPayment(id);
    const b = p.booking;
    await this.prisma.$transaction([
      this.prisma.payment.update({ where: { id }, data: { status: 'FAILED', reviewedAt: new Date(), reviewedBy: adminId, reviewNote: reason.trim(), processedAt: new Date() } }),
      this.prisma.booking.update({ where: { id: b.id }, data: { status: 'CANCELLED', awaitingVerification: false, cancelledAt: new Date(), cancelReason: 'Bank payment could not be verified' } }),
      this.prisma.availabilitySlot.update({ where: { id: b.slotId }, data: { isBooked: false, seatsTaken: { decrement: 1 } } }),
    ]);
    this.activity.record(b.studentId, 'bank_transfer_rejected', { reference: b.reference, label: reason.slice(0, 100) });
    await this.prisma.auditLog.create({ data: { adminId, action: 'BANK_PAYMENT_REJECTED', entityType: 'Payment', entityId: id, detail: `${b.reference}: ${reason.trim().slice(0, 300)}` } });
    await this.notify.send(b.student.email, 'We could not verify your payment', `Hi ${b.student.name.split(' ')[0]},\n\nWe could not match your bank transfer for your session with ${b.mentor.user.name}, so the booking has been released.\n\nReason: ${reason.trim()}\n\nIf you did send the money, reply to this email with a screenshot of the transfer and we will sort it out straight away. Otherwise you are welcome to book again.`, b.studentId, { whatsapp: { alert: 'paymentNotVerified', params: [b.student.name.split(' ')[0], b.mentor.user.name, money(p.amountMinor), p.bankTxnRef ?? '—', reason.trim(), `${webUrl()}/dashboard/student`] }, facts: [['Transaction ID you gave', p.bankTxnRef ?? '—'], ['Amount', money(p.amountMinor)], ['Reference', b.reference]] });
    return this.pending();
  }
}
