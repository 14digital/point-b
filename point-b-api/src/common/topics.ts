/**
 * The main topics students and professionals browse by. Mentors describe their own expertise in detail; each mentor is
 * placed under the main topics that fit, from their expertise, industries, title and what they help with. Change the
 * list here and the mentors page, the home page and the filters all follow.
 */
export const TOPICS: { key: string; label: string; match: RegExp }[] = [
  { key: 'career', label: 'Career guidance', match: /\b(career|interview|cv|job search|first job|graduate|professional development)\b/i },
  { key: 'leadership', label: 'Leadership & management', match: /\b(leadership|leading|leader|management|manager|supervision|supervisory|team development|people management|executive|change management|governance)\b/i },
  { key: 'business', label: 'Business & strategy', match: /\b(business|strateg\w*|consulting|operating-model|operational|operations|p&l|transformation|process|sme|growth|innovation|performance management|project & programme)\b/i },
  { key: 'startups', label: 'Entrepreneurship & startups', match: /\b(entrepreneur\w*|startups?|venture\w*|customer discovery|market validation|starting a)\b/i },
  { key: 'technology', label: 'Technology & software', match: /\b(software|web development|android|react|next\.js|vue\.js|ruby|crm|information technology|it consulting|it transformation|technical|technology|careers in it)\b/i },
  { key: 'ai', label: 'AI & data', match: /\b(artificial intelligence|ai|data|machine learning|analytics)\b/i },
  { key: 'marketing', label: 'Marketing & branding', match: /\b(marketing|branding|brand|media|b2b|influence|customer segmentation)\b/i },
  { key: 'finance', label: 'Finance & banking', match: /\b(finance|financial|banking|bank|trade finance|insurance|investment banking|private equity|portfolio management|risk management|accounting)\b/i },
  { key: 'health', label: 'Health & social care', match: /\b(health\w*|social care|home care|complex care|care service|care governance|care policies|care-sector|nursing|medicine|medical|mental health|wellbeing|cqc|safeguarding|learning disabilities|children's (residential care|services|home|social care))\b/i },
  { key: 'education', label: 'Education & teaching', match: /\b(education\w*|teaching|teacher|curriculum|school|academic|universit\w*|teaching abroad)\b/i },
  { key: 'engineering', label: 'Engineering & energy', match: /(?<!software )\b(engineering|engineer)\b|\b(energy|oil & gas|petrochemicals?|environmental|railway|civil|structural)\b/i },
];

export const TOPIC_KEYS = TOPICS.map((t) => t.key);

/** The main topics a mentor belongs under. */
export function topicsFor(m: { expertise: string[]; industries: string[]; helpTopics?: string[]; title?: string }): string[] {
  const text = [...m.expertise, ...m.industries, ...(m.helpTopics ?? []), m.title ?? ''].join(' · ');
  return TOPICS.filter((t) => t.match.test(text)).map((t) => t.key);
}
