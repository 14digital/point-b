/** Suggestions for the guided mentor form. */

const GENERAL_SKILLS = ["Communication & soft skills", "Presentation skills", "Leadership", "Career planning", "Interview preparation", "Negotiation", "Problem solving", "Networking"];

const INDUSTRY_SKILLS: Record<string, string[]> = {
  "Banking & Financial Services": ["Financial analysis", "Risk management", "Client relationships", "Corporate banking"],
  Technology: ["Software engineering", "Product management", "System design", "Data analysis"],
  "Marketing & Brand": ["Brand strategy", "Digital marketing", "Content & storytelling", "Market research"],
  Entrepreneurship: ["Starting a business", "Fundraising", "Business planning", "Early-stage hiring"],
  "Operations & Supply Chain": ["Process improvement", "Supply chain planning", "Team operations", "Vendor management"],
  "Human Resources": ["Hiring & recruitment", "Performance management", "Workplace culture", "CV review"],
  "Law & Compliance": ["Legal careers", "Contract basics", "Compliance", "Professional ethics"],
  Healthcare: ["Medical careers", "Patient communication", "Clinical training", "Healthcare management"],
  Design: ["Portfolio building", "UX design", "Design critique", "Visual communication"],
  Education: ["University admissions", "Teaching & training", "Study planning", "Scholarship applications"],
  Consulting: ["Case interviews", "Structured thinking", "Client management", "Business strategy"],
};

const STRENGTHS: Record<string, string[]> = {
  "Communication & soft skills": ["Explaining complex ideas simply", "Listening before giving advice", "Giving honest, kind feedback"],
  "Presentation skills": ["Structuring a clear story", "Handling tough questions", "Presenting with confidence"],
  Leadership: ["Building trust in a team", "Making decisions under pressure", "Moving from specialist to manager"],
  "Career planning": ["Helping people choose between options", "Mapping out realistic next steps", "Planning a career change"],
  "Interview preparation": ["Running realistic mock interviews", "Answering competency questions", "Showing what hiring managers look for"],
  Negotiation: ["Negotiating salary and offers", "Preparing for difficult conversations"],
  "Problem solving": ["Breaking big problems into steps", "Asking the right questions"],
  Networking: ["Building professional relationships", "Reaching out to senior people"],
};

const SKILL_TOPICS: Record<string, string[]> = {
  "Interview preparation": ["Interview preparation", "CV and portfolio review"],
  "Career planning": ["Career guidance"],
  Leadership: ["Leadership", "Professional development"],
  "Presentation skills": ["Professional development"],
  "Communication & soft skills": ["Professional development"],
  "CV review": ["CV and portfolio review"],
  "Portfolio building": ["CV and portfolio review"],
  "University admissions": ["Academic decisions"],
  "Study planning": ["Academic decisions"],
  "Scholarship applications": ["Academic decisions"],
};

export const skillsFor = (industry: string) => [...(INDUSTRY_SKILLS[industry] ?? []), ...GENERAL_SKILLS];

export function strengthsFor(goodAt: string[]) {
  const out = goodAt.flatMap((s) => STRENGTHS[s] ?? [`Practical, real-world ${s.toLowerCase()} advice`, `Explaining ${s.toLowerCase()} simply`]);
  return [...new Set(out)].slice(0, 12);
}

export function topicsFor(goodAt: string[], industry: string) {
  const out = goodAt.flatMap((s) => SKILL_TOPICS[s] ?? []);
  if (industry === "Entrepreneurship") out.push("Entrepreneurship", "Business challenges");
  if (industry === "Technology") out.push("Technical guidance");
  return [...new Set([...out, "Career guidance", "Industry advice"])];
}

export const MOTIVATION_STARTERS = [
  "I wish someone had told me earlier that ",
  "When I was starting out, the advice that helped me most was ",
  "I want to help students avoid the mistakes I made with ",
  "The people I can help most are those who ",
];

const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** A plain starting point built only from what the applicant has entered. They edit it from here. */
export function draftMotivation(f: { currentRole: string; industry: string; yearsExperience: string; specialistAreas: string[]; strengths: string[] }) {
  const years = Number(f.yearsExperience);
  const background = [f.currentRole.trim() && `I work as ${/^[aeiou]/i.test(f.currentRole.trim()) ? "an" : "a"} ${f.currentRole.trim()}`, years > 0 && `with ${years} year${years === 1 ? "" : "s"} of experience in ${f.industry}`].filter(Boolean).join(" ");
  const skills = f.specialistAreas.slice(0, 3).map((s) => s.toLowerCase());
  const strengths = f.strengths.slice(0, 2).map((s) => s.toLowerCase());
  return [
    background && `${background}.`,
    skills.length > 0 && `I'd like to mentor because I can help students with ${list(skills)}.`,
    strengths.length > 0 && `${strengths.length > 1 ? "My strongest points are" : "My strongest point is"} ${list(strengths)}.`,
  ].filter(Boolean).join(" ");
}
