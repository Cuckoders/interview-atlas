import assert from 'node:assert/strict';
import test from 'node:test';

import type { ArbeitnowJob } from '../src/adapters/arbeitnow-adapter.js';
import { normalizeArbeitnowJob, stripHtml } from '../src/normalization.js';

const job: ArbeitnowJob = {
  slug: 'senior-react-developer-1', company_name: 'Atlas GmbH', title: 'Senior React Developer',
  description: '<p>Build UI with <strong>TypeScript</strong> &amp; React.</p><script>alert(1)</script>',
  remote: true, url: 'https://www.arbeitnow.com/jobs/senior-react-developer-1',
  tags: ['React', 'TypeScript'], job_types: ['Full-time'], location: 'Europe', created_at: 1788177600,
};

test('normalizes a relevant job and removes markup', () => {
  const result = normalizeArbeitnowJob(job, '2026-08-31T12:00:00.000Z');
  assert.ok(result);
  assert.equal(result.specialty, 'Frontend');
  assert.equal(result.workFormat, 'Удалённо');
  assert.equal(result.level, 'Senior');
  assert.match(result.description, /TypeScript & React/);
  assert.doesNotMatch(result.description, /alert/);
});

test('drops non-technical vacancies', () => {
  assert.equal(normalizeArbeitnowJob({ ...job, title: 'Accountant', tags: [], description: 'Bookkeeping and finance' }), null);
  assert.equal(normalizeArbeitnowJob({ ...job, title: 'Associate Director Quality Compliance / QA Client', tags: [], description: 'Pharma compliance' }), null);
  assert.equal(normalizeArbeitnowJob({ ...job, title: 'Business Developer', tags: [], description: 'Sales and partnerships' }), null);
});

test('stripHtml decodes numeric entities to plain text', () => {
  assert.equal(stripHtml('<p>R&#x26;D &#38; QA</p>'), 'R&D & QA');
  assert.equal(stripHtml('&lt;h1&gt;Title&lt;/h1&gt;&lt;script&gt;alert(1)&lt;/script&gt;'), 'Title');
});
