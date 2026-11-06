# WhatsApp templates

Create each one in WhatsApp Manager → Message templates → Create template.
Category: **Utility**. Language: **English** (`en`). Paste the body exactly, then give the sample values in order.

## pointb_booking_confirmed

```
Hi {{1}}, your booking is confirmed and your payment has been received.

Mentor: {{2}}
When: {{3}}
Session: {{4}}
Reference: {{5}}

View or join your session:
{{6}}

We will remind you 30 minutes before it starts.
```

| Variable | Means | Sample |
|---|---|---|
| {{1}} | first name | Maryam |
| {{2}} | mentor | Zainab Malik |
| {{3}} | date and time | Monday, 9 November 2026 at 3:00 pm Pakistan Standard Time |
| {{4}} | session type | 1:1 session |
| {{5}} | reference | PBM-F0B3F65C |
| {{6}} | link | https://www.example.com/session/PBM-F0B3F65C |

## pointb_session_reminder

```
Hi {{1}}, your session with {{2}} starts in {{3}} minutes.

Join here:
{{4}}

Your mentor will be in the room.
```

| Variable | Means | Sample |
|---|---|---|
| {{1}} | first name | Maryam |
| {{2}} | mentor | Zainab Malik |
| {{3}} | minutes | 30 |
| {{4}} | link | https://www.example.com/session/PBM-F0B3F65C |

## pointb_session_rescheduled

```
Hi {{1}}, your session with {{2}} has been rescheduled.

New time: {{3}}
Previously: {{4}}
Reference: {{5}}

Your payment carries over, so there is nothing more to pay. Details:
{{6}}

We will remind you 30 minutes before it starts.
```

| Variable | Means | Sample |
|---|---|---|
| {{1}} | first name | Maryam |
| {{2}} | mentor | Zainab Malik |
| {{3}} | new time | Tuesday, 10 November 2026 at 3:00 pm Pakistan Standard Time |
| {{4}} | previous time | Monday, 9 November 2026 at 3:00 pm Pakistan Standard Time |
| {{5}} | reference | PBM-F0B3F65C |
| {{6}} | link | https://www.example.com/session/PBM-F0B3F65C |

## pointb_booking_cancelled

```
Hi {{1}}, your session with {{2}} on {{3}} has been cancelled. {{4}}

Reference: {{5}}

You can book another time here:
{{6}}

Thank you for using POINT B Mentors.
```

| Variable | Means | Sample |
|---|---|---|
| {{1}} | first name | Maryam |
| {{2}} | mentor | Zainab Malik |
| {{3}} | date and time | Monday, 9 November 2026 at 3:00 pm Pakistan Standard Time |
| {{4}} | refund line | A full refund has been issued to your original payment method. |
| {{5}} | reference | PBM-F0B3F65C |
| {{6}} | link | https://www.example.com/mentors/zainab-malik |

## pointb_feedback_request

```
Hi {{1}}, thank you for your session with {{2}} on {{3}}.

Please rate your session and share a few words about how it went:
{{4}}

It takes less than a minute.
```

| Variable | Means | Sample |
|---|---|---|
| {{1}} | first name | Maryam |
| {{2}} | mentor | Zainab Malik |
| {{3}} | date and time | Monday, 9 November 2026 at 3:00 pm Pakistan Standard Time |
| {{4}} | link | https://www.example.com/dashboard/student |

## pointb_payment_received

```
Thank you, {{1}}. We have received the bank transfer details for your POINT B session with {{2}}.

Amount: {{3}}
Transaction ID: {{4}}
Booking reference: {{5}}

We are now verifying this payment and your session time remains reserved for you. We will send a confirmation as soon as the payment is verified, usually within a few hours.
```

| Variable | Means | Sample |
|---|---|---|
| {{1}} | first name | Maryam |
| {{2}} | mentor | Zainab Malik |
| {{3}} | amount | Rs 1,500 |
| {{4}} | transaction ID | TXN 4471 2209 |
| {{5}} | reference | PBM-F0B3F65C |

## pointb_payment_not_verified

```
Hi {{1}}, we could not verify your bank transfer for your session with {{2}}, so the booking has been released.

Amount: {{3}}
Transaction ID: {{4}}
Reason: {{5}}

If you did send the money, reply to our email with a screenshot of the transfer. Your dashboard:
{{6}}

You are welcome to book again.
```

| Variable | Means | Sample |
|---|---|---|
| {{1}} | first name | Maryam |
| {{2}} | mentor | Zainab Malik |
| {{3}} | amount | Rs 1,500 |
| {{4}} | transaction ID | TXN 4471 2209 |
| {{5}} | reason | The amount did not match the session price. |
| {{6}} | link | https://www.example.com/dashboard/student |

