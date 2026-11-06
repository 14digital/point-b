/**
 * One WhatsApp template per student alert, each to be submitted in WhatsApp Manager under the Utility category.
 * Fixed, transactional wording keeps Meta from charging them as marketing (one generic template was, so most were
 * blocked with error 131049). The body here is exactly what to paste; params fill {{1}}, {{2}}… in order.
 * The welcome message is email only: Meta filed its template as Marketing.
 * Run `npm run whatsapp:templates` to print them all with sample values for the submission form.
 */
export const WHATSAPP_TEMPLATES = {
  bookingConfirmed: {
    name: 'pointb_booking_confirmed',
    params: ['first name', 'mentor', 'date and time', 'session type', 'reference', 'link'],
    body: 'Hi {{1}}, your booking is confirmed and your payment has been received.\n\nMentor: {{2}}\nWhen: {{3}}\nSession: {{4}}\nReference: {{5}}\n\nView or join your session:\n{{6}}\n\nWe will remind you 30 minutes before it starts.',
    sample: ['Maryam', 'Zainab Malik', 'Monday, 9 November 2026 at 3:00 pm Pakistan Standard Time', '1:1 session', 'PBM-F0B3F65C', 'https://www.example.com/session/PBM-F0B3F65C'],
  },
  sessionReminder: {
    name: 'pointb_session_reminder',
    params: ['first name', 'mentor', 'minutes', 'link'],
    body: 'Hi {{1}}, your session with {{2}} starts in {{3}} minutes.\n\nJoin here:\n{{4}}\n\nYour mentor will be in the room.',
    sample: ['Maryam', 'Zainab Malik', '30', 'https://www.example.com/session/PBM-F0B3F65C'],
  },
  sessionRescheduled: {
    name: 'pointb_session_rescheduled',
    params: ['first name', 'mentor', 'new time', 'previous time', 'reference', 'link'],
    body: 'Hi {{1}}, your session with {{2}} has been rescheduled.\n\nNew time: {{3}}\nPreviously: {{4}}\nReference: {{5}}\n\nYour payment carries over, so there is nothing more to pay. Details:\n{{6}}\n\nWe will remind you 30 minutes before it starts.',
    sample: ['Maryam', 'Zainab Malik', 'Tuesday, 10 November 2026 at 3:00 pm Pakistan Standard Time', 'Monday, 9 November 2026 at 3:00 pm Pakistan Standard Time', 'PBM-F0B3F65C', 'https://www.example.com/session/PBM-F0B3F65C'],
  },
  bookingCancelled: {
    name: 'pointb_booking_cancelled',
    params: ['first name', 'mentor', 'date and time', 'refund line', 'reference', 'link'],
    body: 'Hi {{1}}, your session with {{2}} on {{3}} has been cancelled. {{4}}\n\nReference: {{5}}\n\nYou can book another time here:\n{{6}}\n\nThank you for using POINT B Mentors.',
    sample: ['Maryam', 'Zainab Malik', 'Monday, 9 November 2026 at 3:00 pm Pakistan Standard Time', 'A full refund has been issued to your original payment method.', 'PBM-F0B3F65C', 'https://www.example.com/mentors/zainab-malik'],
  },
  feedbackRequest: {
    name: 'pointb_feedback_request',
    params: ['first name', 'mentor', 'date and time', 'link'],
    body: 'Hi {{1}}, thank you for your session with {{2}} on {{3}}.\n\nPlease rate your session and share a few words about how it went:\n{{4}}\n\nIt takes less than a minute.',
    sample: ['Maryam', 'Zainab Malik', 'Monday, 9 November 2026 at 3:00 pm Pakistan Standard Time', 'https://www.example.com/dashboard/student'],
  },
  paymentReceived: {
    name: 'pointb_payment_received',
    params: ['first name', 'mentor', 'amount', 'transaction ID', 'reference'],
    body: 'Thank you, {{1}}. We have received the bank transfer details for your POINT B session with {{2}}.\n\nAmount: {{3}}\nTransaction ID: {{4}}\nBooking reference: {{5}}\n\nWe are now verifying this payment and your session time remains reserved for you. We will send a confirmation as soon as the payment is verified, usually within a few hours.',
    sample: ['Maryam', 'Zainab Malik', 'Rs 1,500', 'TXN 4471 2209', 'PBM-F0B3F65C'],
  },
  paymentNotVerified: {
    name: 'pointb_payment_not_verified',
    params: ['first name', 'mentor', 'amount', 'transaction ID', 'reason', 'link'],
    body: 'Hi {{1}}, we could not verify your bank transfer for your session with {{2}}, so the booking has been released.\n\nAmount: {{3}}\nTransaction ID: {{4}}\nReason: {{5}}\n\nIf you did send the money, reply to our email with a screenshot of the transfer. Your dashboard:\n{{6}}\n\nYou are welcome to book again.',
    sample: ['Maryam', 'Zainab Malik', 'Rs 1,500', 'TXN 4471 2209', 'The amount did not match the session price.', 'https://www.example.com/dashboard/student'],
  },
} as const;

export type WhatsAppAlert = keyof typeof WHATSAPP_TEMPLATES;
