import { z } from 'zod';

const jobSchema = z.object({
  slug: z.string().min(1).max(250).regex(/^[a-zA-Z0-9._-]+$/),
  company_name: z.string().min(1).max(200),
  title: z.string().min(1).max(300),
  description: z.string().max(200_000),
  remote: z.boolean(),
  url: z.url().refine(isAllowedArbeitnowUrl, 'Unexpected vacancy URL'),
  tags: z.array(z.string().max(100)).max(50).default([]),
  job_types: z.array(z.string().max(100)).max(20).default([]),
  location: z.string().max(200).default('Не указано'),
  created_at: z.number().int().positive(),
});

const responseSchema = z.object({
  data: z.array(z.unknown()).max(500),
});

function isAllowedArbeitnowUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['www.arbeitnow.com', 'arbeitnow.com', 'www.arbeitnow.co.uk', 'arbeitnow.co.uk'].includes(url.hostname);
  } catch {
    return false;
  }
}

export type ArbeitnowJob = z.infer<typeof jobSchema>;

export interface VacancySourceAdapter {
  readonly source: string;
  fetchLatest(): Promise<ArbeitnowJob[]>;
}

export class ArbeitnowAdapter implements VacancySourceAdapter {
  readonly source = 'Arbeitnow';

  constructor(
    private readonly timeoutMs: number,
    private readonly endpoint = 'https://www.arbeitnow.com/api/job-board-api?page=1',
  ) {}

  async fetchLatest(): Promise<ArbeitnowJob[]> {
    const response = await fetch(this.endpoint, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'InterviewAtlas/0.1 (+https://github.com/Cuckoders/interview-atlas)',
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) throw new Error(`Vacancy source responded with ${response.status}`);
    const rawItems = responseSchema.parse(await response.json()).data;
    return rawItems.flatMap((item) => {
      const parsed = jobSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });
  }
}
