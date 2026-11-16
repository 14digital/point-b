export type Role = "STUDENT" | "MENTOR" | "ADMIN";
export type Currency = "PKR" | "GBP" | "USD" | "EUR" | "AED" | "SAR" | "QAR" | "CAD" | "AUD" | "NZD" | "INR" | "BDT" | "KES" | "NGN" | "ZAR" | "SGD" | "MYR" | "TRY"
  | "OMR" | "KWD" | "BHD" | "JOD" | "EGP" | "LKR" | "NPR" | "HKD" | "CNY" | "PHP" | "THB" | "IDR" | "CHF" | "SEK" | "NOK" | "DKK";
export type Category = "LOCAL" | "INTERNATIONAL";
export type Level = "PROFESSIONAL" | "SENIOR_SPECIALIST" | "EXECUTIVE";

export interface SessionUser {
  id: string; email: string; name: string; role: Role; timezone: string; isMinor: boolean; guardianConsent: boolean;
  phone?: string | null; whatsappAlerts?: boolean; emailVerified?: boolean;
  mentorProfile?: { id: string; slug: string; status: string } | null;
  /** Admins only. */
  staffRole?: "OWNER" | "OPERATIONS" | "FINANCE"; twoFactorEnabled?: boolean;
}

export type SessionKind = "ONE_TO_ONE" | "GROUP";
export interface Slot { id: string; startAt: string; endAt: string; kind?: SessionKind; capacity?: number; seatsLeft?: number }

export interface MentorSummary {
  id: string; slug: string; name: string; title: string; organization: string; country: string;
  category: Category; level: Level; languages: string[]; expertise: string[]; industries: string[];
  introduction: string; careerSummary: string; qualifications: string[]; achievements: string[];
  helpTopics: string[]; outsideScope: string[]; linkedinUrl: string | null; photoUrl?: string | null; verified: boolean; isDemo: boolean; status: string;
  priceMinor: number; groupPriceMinor: number; currency: Currency; convertedFrom?: "PKR" | "GBP" | null; rating: number | null; reviewCount: number; sessionsCompleted: number; nextAvailable: string | null;
}
export interface MentorDetail extends MentorSummary {
  slots: Slot[];
  reviews: { id: string; rating: number; comment: string; createdAt: string; agenda: string; author: string }[];
}

export type BookingStatus = "PENDING_PAYMENT" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
export interface Booking {
  id: string; reference: string; status: BookingStatus; sessionKind?: SessionKind; agenda: string;
  currentSituation: string; usefulOutcome: string; materialsToReview: string;
  priceMinor: number; currency: Currency; startAt: string; endAt: string;
  mentor: { id: string; slug: string; name: string; title: string; photoUrl?: string | null };
  student?: { id: string; name: string };
  meetingLink: string | null; review: { rating: number; comment: string; status: ReviewStatus; canEdit?: boolean; clarity?: number | null; usefulness?: number | null; recommend?: number | null } | null; canReview?: boolean; canReportMissing?: boolean; mentorReport?: string | null; mentorReportNote?: string | null;
  payment: { providerRef: string; provider: string; status: string; processedAt?: string | null; bankSubmittedAt?: string | null; bankTxnRef?: string | null } | null;
  listPriceMinor?: number; discountMinor?: number; walletAppliedMinor?: number;
  holdExpiresAt: string | null; awaitingVerification?: boolean; cancelReason: string | null; createdAt: string;
  rescheduleCount?: number; rescheduledAt?: string | null; rescheduleBy?: string | null;
  cancelBy?: string | null; course?: BookingCourse | null;
}

export type AppStatus =
  | "SUBMITTED" | "UNDER_REVIEW" | "SHORTLISTED" | "INTERVIEW_SCHEDULED" | "INTERVIEW_COMPLETED"
  | "APPROVED" | "ONBOARDING" | "ACTIVE" | "CHANGES_REQUESTED" | "WAITLISTED" | "REJECTED" | "PAUSED" | "SUSPENDED";

export interface Scorecard { experience: number; expertise: number; communication: number; approach: number; conduct: number; total: number }
export interface Application {
  id: string; fullName: string; email: string; phone: string; countryOfResidence: string; professionalLocation: string;
  linkedinUrl: string; headline: string; currentRole: string; organization: string; yearsExperience: number; industry: string;
  specialistAreas: string[]; qualifications: string; languages: string[]; previousMentorshipExperience: string;
  strengths?: string[];
  topicsOffered: string[]; preferredPricing: string; weeklyAvailability: string; motivation: string; participation: string;
  status: AppStatus; internalNotes: string; identityVerified: boolean; submittedAt: string;
  changesRequested?: string | null; changesRequestedAt?: string | null;
  editTokenExpiresAt?: string | null; resubmittedAt?: string | null; resubmissionCount?: number;
  interviewAt?: string | null; interviewDurationMin?: number | null; interviewNote?: string | null;
  scorecard: Scorecard | null; allowedTransitions?: AppStatus[]; passThreshold?: number;
}

export interface Interview { id: string; interviewAt: string; interviewDurationMin: number | null; interviewNote: string | null }
export interface AdminInterview extends Interview { fullName: string; email: string; phone: string; headline: string }

export type ReviewStatus = "PENDING" | "APPROVED" | "HIDDEN";
export interface MyReview {
  id: string; rating: number; comment: string; status: ReviewStatus; createdAt: string; moderatedAt: string | null;
  reference: string; agenda: string; sessionAt: string; studentName: string;
  clarity?: number | null; usefulness?: number | null; recommend?: number | null; isCourse?: boolean;
}

export type CourseStatus = "DRAFT" | "SUBMITTED" | "CHANGES_REQUESTED" | "LIVE" | "CLOSED" | "REJECTED";
export interface CourseClass { number: number; startAt: string; endAt: string }
export interface CourseMentor { id: string; slug: string; name: string; title: string; organization: string; photoUrl?: string | null; country: string }
/** A course as anyone sees it. Prices are always in rupees. */
export interface Course {
  id: string; slug: string; title: string; summary: string; topics: string[]; audience: string;
  schedule: string; startDate: string; startTime: string; weekdays: number[]; sessionsCount: number; sessionMinutes: number;
  firstClassAt: string | null; lastClassAt: string | null; nextClass: CourseClass | null; classesHeld: number; classes: CourseClass[];
  priceMinor: number | null; currency: Currency; capacity: number | null; seatsLeft: number | null;
  open: boolean; full: boolean; ended: boolean; mentor: CourseMentor;
}
export interface CourseDetail extends Course { moreFromMentor: Course[] }
/** A course as its mentor and the POINT B team see it. */
export interface OwnCourse extends Course {
  status: CourseStatus; adminNote: string | null; enrolled: number;
  mentorFeeMinor: number; mentorFeeCurrency: Currency; submittedAt: string | null; reviewedAt: string | null; createdAt: string; updatedAt: string;
}
export interface CourseFeedbackSummary {
  count: number; pending: number; rating: number | null; clarity: number | null; usefulness: number | null; recommend: number | null;
}
export interface AdminCourse extends OwnCourse {
  revenueMinor: number;
  /** Learner gross − mentor fee when the fee is in PKR; otherwise null. */
  companyRevenueMinor: number | null;
  feePaid: { createdAt: string; amountMinor: number; currency: Currency; reference: string | null } | null;
  feedback?: CourseFeedbackSummary;
}
export interface FacultyMember {
  id: string; slug: string; name: string; title: string; organization: string; country: string; photoUrl?: string | null;
  introduction: string; expertise: string[]; industries: string[]; languages: string[]; verified: boolean; rating: number | null; reviewCount: number;
  courses: Omit<Course, "mentor" | "classes">[];
}
/** The course part of a learner's enrolment (a booking with a course). */
export interface BookingCourse { id: string; slug: string; title: string; sessionsCount: number; classes: CourseClass[]; liveClass: CourseClass | null; nextClass: CourseClass | null; endsAt: string }
