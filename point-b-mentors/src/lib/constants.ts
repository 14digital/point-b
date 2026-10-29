export const AGENDAS = [
  "Career guidance", "Professional development", "Interview preparation", "CV and portfolio review",
  "Industry advice", "Technical guidance", "Entrepreneurship", "Business challenges", "Leadership",
  "Academic decisions", "Other",
] as const;

export const LEVEL_LABEL = {
  PROFESSIONAL: "Professional",
  SENIOR_SPECIALIST: "Senior Specialist",
  EXECUTIVE: "Executive / Industry Leader",
} as const;

export const CATEGORY_LABEL = { LOCAL: "Local", INTERNATIONAL: "International" } as const;

export const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: "Submitted", UNDER_REVIEW: "Under review", SHORTLISTED: "Shortlisted",
  INTERVIEW_SCHEDULED: "Interview scheduled", INTERVIEW_COMPLETED: "Interview completed", APPROVED: "Approved",
  ONBOARDING: "Onboarding", ACTIVE: "Active", CHANGES_REQUESTED: "Changes requested", WAITLISTED: "Waitlisted",
  REJECTED: "Rejected", PAUSED: "Paused", SUSPENDED: "Suspended",
  PENDING_PAYMENT: "Awaiting payment", CONFIRMED: "Confirmed", COMPLETED: "Completed", CANCELLED: "Cancelled", NO_SHOW: "No-show",
};
