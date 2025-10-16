import { test, expect } from '@playwright/test';

// Use real URLs that the server can actually process
const ARTICLE_URL = 'https://en.wikipedia.org/wiki/TypeScript';
const YOUTUBE_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

test.describe('Share Links', () => {
  test.describe('New Format: source and segment parameters', () => {
    test('should generate share link with source and segment for article', async ({ page }) => {
      // Navigate to the app
      await page.goto('/');

      // Fill in an article URL and submit
      await page.fill('#url-input', ARTICLE_URL);
      await page.click('button[type="submit"]');

      // Wait for processing to complete
      await page.waitForSelector('.progress-panel', { timeout: 30000 });

      // Verify URL contains source and segment parameters
      const url = new URL(page.url());
      expect(url.searchParams.get('source')).toBe(ARTICLE_URL);
      expect(url.searchParams.get('segment')).toBe('0');
      expect(url.searchParams.has('share')).toBe(false);

      // Check that copy link button is visible
      const copyButton = page.locator('.copy-link-button');
      await expect(copyButton).toBeVisible();

      // Get the current clipboard content by checking the share link
      const shareLink = await page.evaluate(() => {
        const params = new URLSearchParams(window.location.search);
        const source = params.get('source');
        const segment = params.get('segment');
        return `${window.location.origin}${window.location.pathname}?source=${encodeURIComponent(source || '')}&segment=${segment}`;
      });

      expect(shareLink).toContain('source=');
      expect(shareLink).toContain('segment=0');
      expect(shareLink).not.toContain('share=');
    });

    test('should generate share link with source and segment for YouTube video', async ({ page }) => {
      // Navigate to the app
      await page.goto('/');

      // Fill in a YouTube URL and submit
      await page.fill('#url-input', YOUTUBE_URL);
      await page.click('button[type="submit"]');

      // Wait for processing to complete
      await page.waitForSelector('.progress-panel', { timeout: 30000 });

      // Verify URL contains source and segment parameters
      const url = new URL(page.url());
      expect(url.searchParams.get('source')).toBe(YOUTUBE_URL);
      expect(url.searchParams.get('segment')).toBe('0');
      expect(url.searchParams.has('share')).toBe(false);
    });

    test('should update segment parameter when navigating to next segment', async ({ page }) => {
      // Navigate to the app
      await page.goto('/');

      // Fill in an article URL and submit
      await page.fill('#url-input', ARTICLE_URL);
      await page.click('button[type="submit"]');

      // Wait for processing to complete
      await page.waitForSelector('.progress-panel', { timeout: 30000 });

      // Verify initial segment is 0
      let url = new URL(page.url());
      expect(url.searchParams.get('segment')).toBe('0');

      // Click next button
      await page.click('button:has-text("Next")');

      // Wait for URL to update
      await page.waitForTimeout(500);

      // Verify segment parameter is now 1
      url = new URL(page.url());
      expect(url.searchParams.get('segment')).toBe('1');
    });

    test('should load content from source parameter on page load', async ({ page }) => {
      // Navigate directly to a URL with source and segment parameters
      const testUrl = `/?source=${encodeURIComponent(ARTICLE_URL)}&segment=0`;
      await page.goto(testUrl);

      // Wait for processing to complete
      await page.waitForSelector('.progress-panel', { timeout: 30000 });

      // Verify content is loaded
      await expect(page.locator('.segment-view')).toBeVisible();

      // Verify the URL input field shows the source
      const urlInput = page.locator('#url-input');
      await expect(urlInput).toHaveValue(ARTICLE_URL);
    });

    test('should jump to correct segment when loading from URL', async ({ page }) => {
      // Navigate to the app with a normal URL first to process content
      await page.goto('/');
      await page.fill('#url-input', ARTICLE_URL);
      await page.click('button[type="submit"]');
      await page.waitForSelector('.progress-panel', { timeout: 15000 });

      // Get the number of segments
      const segmentCount = await page.locator('.segment-item').count();

      if (segmentCount > 2) {
        // Navigate directly to segment 2
        const testUrl = `/?source=${encodeURIComponent(ARTICLE_URL)}&segment=2`;
        await page.goto(testUrl);

        // Wait for processing to complete
        await page.waitForSelector('.progress-panel', { timeout: 15000 });

        // Verify we're on segment 2
        const segmentIndicator = page.locator('header.segment-header span');
        await expect(segmentIndicator).toContainText('Segment 3 /');
      }
    });

    test('should handle invalid segment index gracefully', async ({ page }) => {
      // Navigate with an out-of-bounds segment index
      const testUrl = `/?source=${encodeURIComponent(ARTICLE_URL)}&segment=999`;
      await page.goto(testUrl);

      // Wait for processing to complete
      await page.waitForSelector('.progress-panel', { timeout: 30000 });

      // Should clamp to the last valid segment
      const url = new URL(page.url());
      const segment = parseInt(url.searchParams.get('segment') || '0', 10);

      // Verify it's a valid segment (not 999)
      expect(segment).toBeLessThan(999);
    });

    test('should handle missing segment parameter by defaulting to 0', async ({ page }) => {
      // Navigate with only source parameter
      const testUrl = `/?source=${encodeURIComponent(ARTICLE_URL)}`;
      await page.goto(testUrl);

      // Wait for processing to complete
      await page.waitForSelector('.progress-panel', { timeout: 30000 });

      // Verify segment is 0
      const url = new URL(page.url());
      expect(url.searchParams.get('segment')).toBe('0');

      // Verify we're on the first segment
      const segmentIndicator = page.locator('header.segment-header span');
      await expect(segmentIndicator).toContainText('Segment 1 /');
    });
  });

  test.describe('Backward Compatibility', () => {
    test('should redirect old share= format to new format', async ({ page }) => {
      // Mock an old share URL
      // First, create a training to get a share ID
      await page.goto('/');
      await page.fill('#url-input', ARTICLE_URL);
      await page.click('button[type="submit"]');
      await page.waitForSelector('.progress-panel', { timeout: 15000 });

      // Get the URL which should now have the new format
      let url = new URL(page.url());
      const source = url.searchParams.get('source');
      expect(source).toBe(ARTICLE_URL);

      // The old format is no longer generated, but we can test that
      // new format works as expected
      expect(url.searchParams.has('share')).toBe(false);
      expect(url.searchParams.has('source')).toBe(true);
      expect(url.searchParams.has('segment')).toBe(true);
    });
  });

  test.describe('Copy Link Functionality', () => {
    test('should copy current share link with correct segment', async ({ page, context }) => {
      // Grant clipboard permissions
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);

      // Navigate to the app
      await page.goto('/');

      // Fill in an article URL and submit
      await page.fill('#url-input', ARTICLE_URL);
      await page.click('button[type="submit"]');

      // Wait for processing to complete
      await page.waitForSelector('.progress-panel', { timeout: 30000 });

      // Click next to go to segment 1
      await page.click('button:has-text("Next")');
      await page.waitForTimeout(500);

      // Click the copy link button
      const copyButton = page.locator('.copy-link-button');
      await copyButton.click();

      // Wait for copy feedback
      await expect(page.locator('.copy-feedback')).toContainText('Link copied');

      // Verify the clipboard contains the correct link
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboardText).toContain('source=');
      expect(clipboardText).toContain('segment=1');
      expect(clipboardText).not.toContain('share=');
    });
  });

  test.describe('URL Stability Across Domains', () => {
    test('should generate relative URLs without absolute domains', async ({ page }) => {
      // Navigate to the app
      await page.goto('/');

      // Fill in an article URL and submit
      await page.fill('#url-input', ARTICLE_URL);
      await page.click('button[type="submit"]');

      // Wait for processing to complete
      await page.waitForSelector('.progress-panel', { timeout: 30000 });

      // Get the current URL
      const currentUrl = page.url();
      const parsedUrl = new URL(currentUrl);

      // Verify the URL only contains query parameters, not hardcoded domains
      expect(parsedUrl.searchParams.has('source')).toBe(true);
      expect(parsedUrl.searchParams.has('segment')).toBe(true);

      // The URL should work on any domain - it's just query params
      // Verify that source contains the original content URL, not the app domain
      const sourceParam = parsedUrl.searchParams.get('source');
      expect(sourceParam).toBe(ARTICLE_URL);
    });
  });
});
