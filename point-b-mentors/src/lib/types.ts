export type Role = "STUDENT" | "MENTOR" | "ADMIN";
export type Currency = "PKR" | "GBP";
export type Category = "LOCAL" | "INTERNATIONAL";
export type Level = "PROFESSIONAL" | "SENIOR_SPECIALIST" | "EXECUTIVE";

export interface SessionUser {
  id: string; email: string; name: string; role: Role; timezone: string; isMinor: boolean; guardianConsent: boolean;
  mentorProfile?: { id: string; slug: string; status: string } | null;
}

export type SessionKind = "ONE_TO_ONE" | "GROUP";
export interface Slot { id: string; startAt: string; endAt: string; kind?: SessionKind; capacity?: number; seatsLeft?: number }

export interface MentorSummary {
  id: string; slug: string; name: string; title: string; organization: string; country: string;
  category: Category; level: Level; languages: string[]; expertise: string[]; industries: string[];
  introduction: string; careerSummary: string; qualifications: string[]; achievements: string[];
  helpTopics: string[]; outsideScope: string[]; linkedinUrl: string | null; photoUrl?: string | null; verified: boolean; isDemo: boolean; status: string;
  priceMinor: number; groupPriceMinor: number; currency: Currency; rating: number | null; reviewCount: number; sessionsCompleted: number; nextAvailable: string | null;
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
  meetingLink: string | null; review: { rating: number; comment: string } | null;
  payment: { providerRef: string; provider: string; status: string } | null;
  holdExpiresAt: string | null; cancelReason: string | null; createdAt: string;
  rescheduleCount?: number; rescheduledAt?: string | null; rescheduleBy?: string | null;
}

export type AppStatus =
  | "SUBMITTED" | "UNDER_REVIEW" | "SHORTLISTED" | "INTERVIEW_SCHEDULED" | "INTERVIEW_COMPLETED"
  | "APPROVED" | "ONBOARDING" | "ACTIVE" | "CHANGES_REQUESTED" | "WAITLISTED" | "REJECTED" | "PAUSED" | "SUSPENDED";

export interface Scorecard { experience: number; expertise: number; communication: number; approach: number; conduct: number; total: number }
export interface Application {
  id: string; fullName: string; email: string; phone: string; countryOfResidence: string; professionalLocation: string;
  linkedinUrl: string; headline: string; currentRole: string; organization: string; yearsExperience: number; industry: string;
  specialistAreas: string[]; qualifications: string; languages: string[]; previousMentorshipExperience: string;
  topicsOffered: string[]; preferredPricing: string; weeklyAvailability: string; motivation: string; participation: string;
  status: AppStatus; internalNotes: string; identityVerified: boolean; submittedAt: string;
  changesRequested?: string | null; changesRequestedAt?: string | null;
  editTokenExpiresAt?: string | null; resubmittedAt?: string | null; resubmissionCount?: number;
  scorecard: Scorecard | null; allowedTransitions?: AppStatus[]; passThreshold?: number;
}
