import { test, expect, type Page } from '@playwright/test';

const patient = { id: 'patient-1', patientCode: 'SS-1001', fullName: 'Annapoorna Krishnamurthy', age: 68, gender: 'Female', village: 'Hoskote' };
const task = {
  id: 'case-1', initials: 'AK', name: patient.fullName, ageLabel: '68 years', ward: 'Ward 4, Hoskote',
  context: 'Reported concern with a detailed description that must remain readable on small screens.',
  time: '10:30 AM', tone: 'urgent', tag: 'Needs review', referralId: 'ref-1', referralStatus: 'Awaiting PHC',
  visitType: 'fresh', severityScore: 9, severityLevel: 'Critical', alertFlagged: true, source: 'telegram',
  aadhaarMasked: 'XXXX-XXXX-1234', triageSummary: 'Priority coordination review requested; follow approved clinical protocols.',
};
const callback = { id: 'callback-1', patientId: patient.id, patientName: patient.fullName, village: 'Hoskote', requestType: 'Callback requested', status: 'Open', createdAt: '2026-11-27' };

async function mockApi(page: Page, role: 'asha' | 'phc' | 'patient') {
  let current = { ...task };
  let requests: typeof callback[] = [];
  await page.goto('/login');
  await page.evaluate((role) => localStorage.setItem('sehat-saheli-demo-session', JSON.stringify({ token: 'fixture-token', user: { id: 'test-user', role, fullName: 'Demo User', username: 'fixture' } })), role);
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api', '');
    if (path === '/referrals/ref-1/acknowledge') current.referralStatus = 'Received at PHC';
    if (path === '/cases/case-1/follow-ups') current.referralStatus = 'Follow-up booked';
    if (path === '/patient/me/callbacks') requests = [callback];
    const detail = { ...current, referral: { id: 'ref-1', caseId: current.id, facility: 'Hoskote PHC', reason: current.context, status: current.referralStatus, sentAt: '10:30 AM' }, events: [{ id: 'event-1', caseId: current.id, type: 'intake', text: current.context, timestamp: '27 November 2026, 10:30 AM' }] };
    const payloads: Record<string, unknown> = {
      '/dashboard': { tasks: [current], greeting: 'Good morning, Sunita.', dateLabel: 'Friday, 27 November', metrics: { visitsToday: 1, confirmedVisits: 0, openReferrals: 1, followUpsDue: 0 }, callbackRequests: [callback] },
      '/asha/me': { profile: { fullName: 'Sunita ASHA', village: 'Hoskote', assignedPanchayat: 'Hoskote', workerCode: 'AS-1' }, patients: [patient] },
      '/cases/case-1': detail,
      '/phc/dashboard': { queue: [current], alerts: [current], counts: { total: 1, awaiting: 1, criticalAlerts: 1 } },
      '/patient/me': { profile: { ...patient, ashaName: 'Sunita ASHA', ashaPhone: '+91 90000 00000' }, cases: [current], requests },
      '/patient/me/callbacks': callback,
      '/intake/visit': { careCase: detail, visitType: 'fresh', isNewAccount: true, credentials: { username: 'demo-patient', password: 'fixture-only' } },
    };
    await route.fulfill({ json: payloads[path] ?? { status: current.referralStatus }, headers: { 'access-control-allow-origin': '*' } });
  });
}

async function expectFits(page: Page) {
  // Inspect actual boxes: overflow clipping must not conceal unreachable content.
  const overflowing = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(el => {
    if (el.closest('.sidebar:not(.show), nextjs-portal')) return false;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    const box = el.getBoundingClientRect();
    return box.width > 0 && (box.left < -1 || box.right > innerWidth + 1);
  }).map(el => `${el.tagName}.${el.className}`).slice(0, 10));
  expect(overflowing).toEqual([]);
}

for (const width of [320, 375, 390, 768, 820, 1024, 1440]) {
  test(`all portals fit at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expectFits(page);
    await mockApi(page, 'asha');
    await page.goto('/asha');
    await expect(page.getByRole('heading', { name: 'People to visit' })).toBeVisible();
    await expectFits(page);
    if (width === 390) await page.screenshot({ path: testInfo.outputPath('asha-mobile.png'), fullPage: true });
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('textbox', { name: 'Search care cases' }).fill('Annapoorna');
    await expectFits(page);
    await page.getByRole('button', { name: 'Close search', exact: true }).click();
    await page.getByRole('button', { name: 'Notifications', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Alerts and calls (2)' })).toBeVisible();
    await expectFits(page);
    await page.getByRole('button', { name: 'Close notifications' }).click();
    await page.getByRole('button', { name: 'Add a visit', exact: true }).first().click();
    await expect(page.getByLabel('12-digit Aadhaar')).toBeVisible();
    await expectFits(page);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'View care case' }).click();
    await expect(page.getByRole('heading', { name: 'Patient details' })).toBeVisible();
    await expectFits(page);
    await mockApi(page, 'phc');
    await page.goto('/phc');
    await expect(page.getByRole('heading', { name: 'Ranked patients (1)' })).toBeVisible();
    await expectFits(page);
    await page.getByRole('button', { name: 'Acknowledge', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Book follow-up' })).toBeVisible();
    await expectFits(page);
    if (width === 390) await page.screenshot({ path: testInfo.outputPath('phc-mobile.png'), fullPage: true });
    await mockApi(page, 'patient');
    await page.goto('/patient');
    await expect(page.getByRole('heading', { name: 'Hello, Annapoorna.' })).toBeVisible();
    await expectFits(page);
  });
}

test('mobile drawer traps focus, closes with Escape and backdrop, and opens families', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await mockApi(page, 'asha');
  await page.goto('/asha');
  const menu = page.getByRole('button', { name: 'Open menu' });
  await menu.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close menu' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
  await menu.click();
  await page.mouse.click(365, 300);
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await menu.click();
  await page.getByRole('button', { name: 'Switch to Kannada' }).click();
  await expectFits(page);
  await page.getByRole('button', { name: 'Switch to English' }).click();
  await page.getByRole('button', { name: 'Families' }).click();
  await expect(page.getByRole('heading', { name: 'Families (1)' })).toBeVisible();
  await expectFits(page);
});

test('new patient credentials remain visible after switching to care case', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await mockApi(page, 'asha');
  await page.goto('/asha');
  await page.getByRole('button', { name: 'Add a visit', exact: true }).first().click();
  await page.getByLabel('Patient name', { exact: true }).fill('Demo Patient');
  await page.getByLabel('Age', { exact: true }).fill('30');
  await page.getByLabel('12-digit Aadhaar').fill('234567891234');
  await page.getByLabel('Reason for visit').fill('Routine review');
  await page.getByRole('button', { name: 'Analyze & save visit' }).click();
  await expect(page.getByRole('heading', { name: 'Patient details' })).toBeVisible();
  await expect(page.getByText('fixture-only')).toBeVisible();
  await expectFits(page);
});

test('PHC sends the selected follow-up date and displays save errors', async ({ page }) => {
  await mockApi(page, 'phc');
  await page.goto('/phc');
  await page.getByRole('button', { name: 'Acknowledge', exact: true }).click();
  await page.getByLabel(`Follow-up date for ${patient.fullName}`).fill('2027-01-15');
  await page.route('**/api/cases/case-1/follow-ups', async route => {
    expect(route.request().postDataJSON()).toEqual({ date: '2027-01-15' });
    await route.fulfill({ status: 400, json: { error: 'Unable to book this date' } });
  });
  await page.getByRole('button', { name: 'Book follow-up' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Unable to book this date' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Book follow-up' })).toBeEnabled();
});

test('patient callback prevents repeat taps and network failures allow retry', async ({ page }) => {
  await mockApi(page, 'patient');
  await page.route('**/api/patient/me', route => route.fulfill({ status: 503, json: { error: 'Offline' } }));
  await page.goto('/patient');
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await page.unroute('**/api/patient/me');
  await page.getByRole('button', { name: 'Retry' }).click();
  await page.getByRole('button', { name: 'Request a callback' }).click();
  await expect(page.getByRole('button', { name: 'Callback requested' })).toBeDisabled();
});
