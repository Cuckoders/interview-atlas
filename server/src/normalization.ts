import type { ArbeitnowJob } from './adapters/arbeitnow-adapter.js';
import type { Specialty, Vacancy, WorkFormat } from './domain.js';

const skillNames = [
  'TypeScript', 'JavaScript', 'React', 'Vue', 'Angular', 'Node.js', 'Python', 'Java',
  'Kotlin', 'Swift', 'Flutter', 'React Native', 'Go', 'PHP', '.NET', 'C#', 'Ruby',
  'PostgreSQL', 'MySQL', 'MongoDB', 'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP',
  'Playwright', 'Cypress', 'Selenium', 'Appium', 'REST', 'GraphQL', 'Git', 'SQL',
] as const;

const specialtyPatterns: [Specialty, RegExp][] = [
  ['QA', /\b(qa (?:engineer|automation|tester)|quality assurance (?:engineer|automation|tester)|software test(?:er|ing)?|test automation|sdet)\b/i],
  ['Mobile', /\b(android|ios|mobile|flutter|react native|kotlin|swift)\b/i],
  ['Frontend', /\b(front[ -]?end|react|vue|angular|javascript|typescript|ui developer)\b/i],
  ['Backend', /\b(back[ -]?end|full[ -]?stack|node(?:\.js)?|python|java|\.net|php|golang|ruby|api|software engineer|(?:software|web|application|salesforce) developer|devops|platform engineer|cloud engineer|sre)\b/i],
];

export function normalizeArbeitnowJob(job: ArbeitnowJob, collectedAt = new Date().toISOString()): Vacancy | null {
  const plainDescription = stripHtml(job.description);
  const haystack = `${job.title} ${job.tags.join(' ')} ${job.job_types.join(' ')} ${plainDescription}`;
  const classificationText = `${job.title} ${job.tags.join(' ')} ${job.job_types.join(' ')}`;
  const specialty = specialtyPatterns.find(([, pattern]) => pattern.test(classificationText))?.[0];
  if (!specialty) return null;

  const skills = skillNames.filter((skill) => new RegExp(escapeRegExp(skill), 'i').test(haystack)).slice(0, 8);
  return {
    id: `arbeitnow-${job.slug}`,
    externalId: job.slug,
    title: job.title.trim(),
    company: job.company_name.trim(),
    location: job.location.trim() || 'Не указано',
    workFormat: inferWorkFormat(job.remote, haystack),
    level: inferLevel(haystack),
    specialty,
    skills: skills.length > 0 ? [...skills] : [specialty],
    description: truncate(plainDescription, 1_200),
    source: 'Arbeitnow',
    sourceUrl: job.url,
    publishedAt: new Date(job.created_at * 1_000).toISOString(),
    collectedAt,
    rawPayload: job,
  };
}

function inferWorkFormat(remote: boolean, text: string): WorkFormat {
  if (/\bhybrid|hybridarbeit|hybrides\b/i.test(text)) return 'Гибрид';
  return remote ? 'Удалённо' : 'Офис';
}

function inferLevel(text: string): string {
  if (/\b(principal|staff|lead|head|director)\b/i.test(text)) return 'Lead';
  if (/\b(senior|sr\.)\b/i.test(text)) return 'Senior';
  if (/\b(junior|jr\.|trainee|intern)\b/i.test(text)) return 'Junior';
  return 'Middle';
}

export function stripHtml(value: string): string {
  return decodeEntities(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => safeCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ');
}

function safeCodePoint(value: number): string {
  return Number.isInteger(value) && value >= 0 && value <= 0x10ffff ? String.fromCodePoint(value) : '';
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
