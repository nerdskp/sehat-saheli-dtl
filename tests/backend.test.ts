import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTelegramVisit } from '../backend/src/telegram-parser';
import { isValidFollowUpDate, todayInIndia } from '../backend/src/follow-up';
import { analyzeSeverityWithGemini } from '../backend/src/triage';

test('Telegram accepts both formats and preserves commas in symptoms', () => {
  assert.deepEqual(parseTelegramVisit('Demo, 30, 234567891234, fever, cough'), { name: 'Demo', age: 30, aadhaar: '234567891234', description: 'fever, cough' });
  assert.deepEqual(parseTelegramVisit(' Name: Demo\n Age: 0\n Aadhaar: 2345-6789-1234\n Symptoms: cough'), { name: 'Demo', age: 0, aadhaar: '234567891234', description: 'cough' });
  assert.equal('error' in parseTelegramVisit('Demo | 30 | 234567891234 | cough'), false);
});

test('Telegram rejects partially numeric ages, missing fields and oversized records', () => {
  for (const age of ['6months', '6.5', '-1', '121', '']) assert.equal('error' in parseTelegramVisit(`Demo, ${age}, 234567891234, cough`), true);
  assert.equal('error' in parseTelegramVisit('Demo,,30,234567891234,cough'), true);
  assert.equal('error' in parseTelegramVisit('Demo,30,034567891234,cough'), true);
  assert.equal('error' in parseTelegramVisit(`Demo,30,234567891234,${'x'.repeat(301)}`), true);
});

test('follow-up dates reject past and impossible dates using India calendar', () => {
  assert.equal(todayInIndia(new Date('2026-11-27T20:00:00Z')), '2026-11-28');
  assert.equal(isValidFollowUpDate('2026-11-27', '2026-11-27'), true);
  assert.equal(isValidFollowUpDate('2026-11-26', '2026-11-27'), false);
  assert.equal(isValidFollowUpDate('2027-02-30', '2026-11-27'), false);
  assert.equal(isValidFollowUpDate('Friday, 28 Nov', '2026-11-27'), false);
});

test('Gemini cannot suppress alerts or contradict the numeric priority', async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-key';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ severityScore: 9, severityLevel: 'Low', alertFlagged: false, recommendedAction: 'Routine follow-up', summary: 'Test output' }) }] } }] }));
  try {
    const result = await analyzeSeverityWithGemini({ name: 'Demo', age: 30, description: 'Test input' });
    assert.equal(result.severityLevel, 'Critical');
    assert.equal(result.alertFlagged, true);
    assert.equal(result.recommendedAction, 'Facility review needed');
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});
