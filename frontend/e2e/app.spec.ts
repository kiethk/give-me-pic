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
  const testEmail = `student_${Date.now()}@example.com`;
  const testPassword = 'Password123!';
  const testName = 'Test Student';

  test('Can register a new user and reach dashboard', async ({ page }) => {
    await page.goto('/register');
    
    // Fill register form
    await page.getByPlaceholder('e.g. Alex Student').fill(testName);
    await page.locator('input[type="email"]').fill(testEmail);
    await page.locator('input[type="password"]').fill(testPassword);

    const submitBtn = page.getByRole('button', { name: /create account|sign up|register|tạo/i });
    await submitBtn.click();

    // After registration, should either auto-login to /dashboard or redirect to /login
    await page.waitForURL(/\/(dashboard|login)/, { timeout: 15000 });
    
    if (page.url().includes('/login')) {
      // Log in
      await page.locator('input[type="email"], input[name="email"]').fill(testEmail);
      await page.locator('input[type="password"]').fill(testPassword);
      await page.getByRole('button', { name: /sign in|log in|đăng nhập/i }).click();
      await page.waitForURL(/\/dashboard/, { timeout: 15000 });
    }

    expect(page.url()).toContain('/dashboard');
  });

  test('Dashboard loads with navigation and actions', async ({ page }) => {
    // Navigate to dashboard
    await page.goto('/dashboard');
    
    // Check if redirected to login or stay on dashboard
    if (page.url().includes('/login')) {
      // Login first
      await page.locator('input[type="email"], input[name="email"]').fill(testEmail);
      await page.locator('input[type="password"]').fill(testPassword);
      await page.getByRole('button', { name: /sign in|log in|đăng nhập/i }).click();
      await page.waitForURL(/\/dashboard/, { timeout: 15000 });
    }

    // Verify Dashboard navigation links exist
    await expect(page.locator('a[href*="/dashboard/upload"]').first()).toBeVisible();
    await expect(page.locator('a[href*="/dashboard/chat"]').first()).toBeVisible();
  });

  test('Upload page UI checks', async ({ page }) => {
    await page.goto('/dashboard/upload');
    if (page.url().includes('/login')) {
      await page.locator('input[type="email"], input[name="email"]').fill(testEmail);
      await page.locator('input[type="password"]').fill(testPassword);
      await page.getByRole('button', { name: /sign in|log in/i }).click();
      await page.waitForURL(/\/dashboard\/upload/, { timeout: 15000 });
    }
    
    // Check subject selector or upload trigger
    await expect(page.locator('input[type="file"]').first()).toBeAttached();
  });

  test('Chat page UI checks', async ({ page }) => {
    await page.goto('/dashboard/chat');
    if (page.url().includes('/login')) {
      await page.locator('input[type="email"], input[name="email"]').fill(testEmail);
      await page.locator('input[type="password"]').fill(testPassword);
      await page.getByRole('button', { name: /sign in|log in/i }).click();
      await page.waitForURL(/\/dashboard\/chat/, { timeout: 15000 });
    }

    // Check chat prompt input
    const chatInput = page.locator('textarea, input[placeholder*="ask" i], input[placeholder*="hỏi" i], input[type="text"]').last();
    await expect(chatInput).toBeVisible();
  });
});
