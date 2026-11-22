import { test, expect } from '@playwright/test';

test.describe('Give Me Pic - Public & Auth Routes', () => {
  test('Login page renders correctly', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/Give Me Pic/i);
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in|log in|đăng nhập/i })).toBeVisible();
  });

  test('Register page renders correctly', async ({ page }) => {
    await page.goto('/register');
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /create account|sign up|register|tạo/i })).toBeVisible();
  });

  test('Offline fallback page renders correctly', async ({ page }) => {
    await page.goto('/offline');
    await expect(page.locator('body')).toContainText(/offline|mạng/i);
  });
});

test.describe('Give Me Pic - End-to-End User Flow', () => {
  test('Full user journey: Auth, Navigation, Subject CRUD', async ({ page }) => {
    const testEmail = `student_${Date.now()}_${Math.floor(Math.random() * 10000)}@example.com`;
    const testPassword = 'Password123!';
    const testName = 'Test Student';

    page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));
    page.on('response', (res) => {
      if (res.status() >= 400) console.log('HTTP ERROR:', res.status(), res.url());
    });
    // 1. Register a new user
    await page.goto('/register');
    await page.getByPlaceholder('e.g. Alex Student').fill(testName);
    await page.locator('input[type="email"]').fill(testEmail);
    await page.locator('input[type="password"]').fill(testPassword);

    const submitBtn = page.getByRole('button', { name: /create account|sign up|register|tạo/i });
    await submitBtn.click();

    await page.waitForURL(/\/(dashboard|login)/, { timeout: 15000 });
    if (page.url().includes('/login')) {
      await page.locator('input[type="email"], input[name="email"]').fill(testEmail);
      await page.locator('input[type="password"]').fill(testPassword);
      await page.getByRole('button', { name: /sign in|log in|đăng nhập/i }).click();
      await page.waitForURL(/\/dashboard/, { timeout: 15000 });
    }
    expect(page.url()).toContain('/dashboard');

    // 2. Navigation checks
    await expect(page.locator('a[href*="/dashboard/upload"]').first()).toBeVisible();
    await expect(page.locator('a[href*="/dashboard/chat"]').first()).toBeVisible();

    // 3. Create a subject
    await page.getByRole('button', { name: /new subject/i }).first().click();
    await page.getByPlaceholder('e.g. Calculus 1').fill('Calculus Test E2E');
    await page.getByRole('dialog').getByRole('button', { name: /create subject/i }).click();
    await expect(page.getByText('Calculus Test E2E')).toBeVisible();

    // 4. Edit the subject
    await page.getByRole('button', { name: 'Subject options' }).first().click();
    await page.getByRole('button', { name: /^edit/i }).click();

    await expect(page.getByRole('heading', { name: /edit subject/i })).toBeVisible();
    await page.getByPlaceholder('e.g. Calculus 1').fill('Calculus Test Renamed');
    await page.getByRole('dialog').getByRole('button', { name: /save changes/i }).click();
    await expect(page.getByText('Calculus Test Renamed')).toBeVisible();

    // 5. Delete the subject
    page.on('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Subject options' }).first().click();
    await page.getByRole('button', { name: /^delete/i }).click();
    await expect(page.getByText('Calculus Test Renamed')).not.toBeVisible();

    // 6. Upload page: can choose photo first & create new subject
    await page.goto('/dashboard/upload');
    const galleryBtn = page.getByRole('button', { name: /choose from gallery/i }).first();
    await expect(galleryBtn).toBeVisible();

    const fileChooserPromise = page.waitForEvent('filechooser');
    await galleryBtn.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: 'lecture_slide.png',
      mimeType: 'image/png',
      buffer: Buffer.from('fake-image-bytes-for-e2e'),
    });

    // Check that staged photo is visible
    await expect(page.getByText(/Selected photos \(1\)/i)).toBeVisible();

    // Verify New subject name input is visible
    const newSubjectInput = page.getByPlaceholder(/e\.g\. International Economics/i);
    await expect(newSubjectInput).toBeVisible();
    await newSubjectInput.fill('Macroeconomics E2E');

    // Click upload
    await page.getByRole('button', { name: /upload 1 photo/i }).click();

    // Verify upload queue appears
    await expect(page.getByText('Uploading', { exact: true })).toBeVisible();

    // 7. Chat page UI check
    await page.goto('/dashboard/chat');
    const chatInput = page.locator('textarea, input[placeholder*="ask" i], input[placeholder*="hỏi" i], input[type="text"]').last();
    await expect(chatInput).toBeVisible();
  });
});
