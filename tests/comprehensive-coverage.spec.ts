import { test, expect } from '@playwright/test';

// Use a real article URL with images for testing
const ARTICLE_WITH_IMAGES = 'https://en.wikipedia.org/wiki/Machine_learning';
const SIMPLE_ARTICLE = 'https://en.wikipedia.org/wiki/TypeScript';

test.describe('Comprehensive Feature Coverage', () => {

  test.describe('Content Styling Consistency', () => {
    test('should maintain consistent article content styling across segments', async ({ page }) => {
      await page.goto('/');

      // Process an article
      await page.fill('#url-input', SIMPLE_ARTICLE);
      await page.click('button[type="submit"]');
      await page.waitForSelector('.progress-panel', { timeout: 30000 });

      // Wait for content to load
      await page.waitForSelector('.segment-body', { timeout: 5000 });

      // Get the content styling for first segment
      const firstSegmentStyles = await page.evaluate(() => {
        const content = document.querySelector('.segment-body');
        if (!content) return null;
        const styles = window.getComputedStyle(content);
        return {
          fontSize: styles.fontSize,
          lineHeight: styles.lineHeight,
          color: styles.color,
          fontFamily: styles.fontFamily,
        };
      });

      expect(firstSegmentStyles).not.toBeNull();

      // Navigate to next segment
      const nextButton = page.locator('button:has-text("Next")');
      await nextButton.click();
      await page.waitForTimeout(500); // Wait for re-render

      // Get the content styling for second segment
      const secondSegmentStyles = await page.evaluate(() => {
        const content = document.querySelector('.segment-body');
        if (!content) return null;
        const styles = window.getComputedStyle(content);
        return {
          fontSize: styles.fontSize,
          lineHeight: styles.lineHeight,
          color: styles.color,
          fontFamily: styles.fontFamily,
        };
      });

      // Styles should be consistent
      expect(secondSegmentStyles).toEqual(firstSegmentStyles);
    });

    test('should maintain menu/sidebar styling', async ({ page }) => {
      await page.goto('/');

      // Get initial sidebar styles
      const initialSidebarStyles = await page.evaluate(() => {
        const sidebar = document.querySelector('.sidebar');
        if (!sidebar) return null;
        const styles = window.getComputedStyle(sidebar);
        return {
          backgroundColor: styles.backgroundColor,
          width: styles.width,
          padding: styles.padding,
        };
      });

      expect(initialSidebarStyles).not.toBeNull();

      // Process an article
      await page.fill('#url-input', SIMPLE_ARTICLE);
      await page.click('button[type="submit"]');
      await page.waitForSelector('.progress-panel', { timeout: 30000 });

      // Get sidebar styles after processing
      const afterProcessingSidebarStyles = await page.evaluate(() => {
        const sidebar = document.querySelector('.sidebar');
        if (!sidebar) return null;
        const styles = window.getComputedStyle(sidebar);
        return {
          backgroundColor: styles.backgroundColor,
          width: styles.width,
          padding: styles.padding,
        };
      });

      // Sidebar styling should remain consistent
      expect(afterProcessingSidebarStyles).toEqual(initialSidebarStyles);
    });
  });

  test.describe('Image Preservation', () => {
    test('should preserve and display original images from articles', async ({ page }) => {
      await page.goto('/');

      // Process an article known to have images
      await page.fill('#url-input', ARTICLE_WITH_IMAGES);
      await page.click('button[type="submit"]');
      await page.waitForSelector('.progress-panel', { timeout: 30000 });

      // Wait for content to load
      await page.waitForSelector('.segment-body', { timeout: 5000 });

      // Check for images in the content
      const images = await page.locator('.segment-body img, .article-segment-content img');
      const imageCount = await images.count();

      // Should have at least one image
      expect(imageCount).toBeGreaterThan(0);

      // Verify images have valid src attributes
      for (let i = 0; i < Math.min(imageCount, 5); i++) {
        const img = images.nth(i);
        const src = await img.getAttribute('src');
        expect(src).toBeTruthy();
        expect(src).toMatch(/^https?:\/\//);
      }
    });

    test('should display images with proper attributes', async ({ page }) => {
      await page.goto('/');

      await page.fill('#url-input', ARTICLE_WITH_IMAGES);
      await page.click('button[type="submit"]');
      await page.waitForSelector('.progress-panel', { timeout: 30000 });
      await page.waitForSelector('.segment-body', { timeout: 5000 });

      // Get all images
      const images = await page.locator('.segment-body img, .article-segment-content img');
      const imageCount = await images.count();

      if (imageCount > 0) {
        const firstImage = images.first();

        // Image should have src
        const src = await firstImage.getAttribute('src');
        expect(src).toBeTruthy();

        // Image should be visible (not hidden)
        await expect(firstImage).toBeVisible();
      }
    });
  });

  test.describe('UI Element Positioning', () => {
    test('should keep slice button in consistent position', async ({ page }) => {
      await page.goto('/');

      // Get initial slice button position
      const initialButtonBox = await page.locator('button[type="submit"]:has-text("Slice")').boundingBox();
      expect(initialButtonBox).not.toBeNull();

      // Type in the URL field (shouldn't move button)
      await page.fill('#url-input', SIMPLE_ARTICLE);

      // Get button position after typing
      const afterTypingButtonBox = await page.locator('button[type="submit"]:has-text("Slice")').boundingBox();

      // Button should be in same position
      expect(afterTypingButtonBox?.x).toBeCloseTo(initialButtonBox!.x, 0);
      expect(afterTypingButtonBox?.y).toBeCloseTo(initialButtonBox!.y, 0);
    });

    test('should maintain navigation button positions', async ({ page }) => {
      await page.goto('/');

      await page.fill('#url-input', SIMPLE_ARTICLE);
      await page.click('button[type="submit"]');
      await page.waitForSelector('.progress-panel', { timeout: 30000 });

      // Get Next button position
      const nextButton = page.locator('button:has-text("Next")');
      const nextButtonBox = await nextButton.boundingBox();
      expect(nextButtonBox).not.toBeNull();

      // Click next
      await nextButton.click();
      await page.waitForTimeout(500);

      // Get Next button position again
      const nextButtonBoxAfter = await nextButton.boundingBox();

      // Button should remain in same position
      expect(nextButtonBoxAfter?.x).toBeCloseTo(nextButtonBox!.x, 0);
      expect(nextButtonBoxAfter?.y).toBeCloseTo(nextButtonBox!.y, 0);
    });
  });

  test.describe('Navigation Functionality', () => {
    test('should navigate forward with Next button', async ({ page }) => {
      await page.goto('/');

      await page.fill('#url-input', SIMPLE_ARTICLE);
      await page.click('button[type="submit"]');
      await page.waitForSelector('.progress-panel', { timeout: 30000 });

      // Get initial segment counter
      const initialSegmentText = await page.locator('.segment-header span').last().textContent();
      expect(initialSegmentText).toContain('Segment 1');

      // Click Next button
      const nextButton = page.locator('button:has-text("Next")');
      await nextButton.click();
      await page.waitForTimeout(500);

      // Segment counter should update
      const newSegmentText = await page.locator('.segment-header span').last().textContent();
      expect(newSegmentText).toContain('Segment 2');
    });

    test('should navigate backward with Previous button', async ({ page }) => {
      await page.goto('/');

      await page.fill('#url-input', SIMPLE_ARTICLE);
      await page.click('button[type="submit"]');
      await page.waitForSelector('.progress-panel', { timeout: 30000 });

      // Navigate to segment 2
      await page.click('button:has-text("Next")');
      await page.waitForTimeout(500);

      const segmentText = await page.locator('.segment-header span').last().textContent();
      expect(segmentText).toContain('Segment 2');

      // Click Previous button
      await page.click('button:has-text("Previous")');
      await page.waitForTimeout(500);

      // Should be back at segment 1
      const backToSegmentText = await page.locator('.segment-header span').last().textContent();
      expect(backToSegmentText).toContain('Segment 1');
    });

    test('should disable Previous button on first segment', async ({ page }) => {
      await page.goto('/');

      await page.fill('#url-input', SIMPLE_ARTICLE);
      await page.click('button[type="submit"]');
      await page.waitForSelector('.progress-panel', { timeout: 30000 });

      // Previous button should be disabled on first segment
      const previousButton = page.locator('button:has-text("Previous")');
      await expect(previousButton).toBeDisabled();
    });

    test('should update content when navigating', async ({ page }) => {
      await page.goto('/');

      await page.fill('#url-input', SIMPLE_ARTICLE);
      await page.click('button[type="submit"]');
      await page.waitForSelector('.progress-panel', { timeout: 30000 });

      // Get first segment label
      const firstSegmentLabel = await page.locator('.segment-body h3').first().textContent();

      // Navigate to next segment
      await page.click('button:has-text("Next")');
      await page.waitForTimeout(500);

      // Get second segment label
      const secondSegmentLabel = await page.locator('.segment-body h3').first().textContent();

      // Labels should be different (content changed)
      expect(secondSegmentLabel).not.toBe(firstSegmentLabel);
    });
  });

  test.describe('Progress Tracking', () => {
    test('should update progress bar as segments are completed', async ({ page }) => {
      await page.goto('/');

      await page.fill('#url-input', SIMPLE_ARTICLE);
      await page.click('button[type="submit"]');
      await page.waitForSelector('.progress-panel', { timeout: 30000 });

      // Get initial progress percentage
      const initialProgress = await page.locator('.progress-header span').last().textContent();
      const initialPercent = parseInt(initialProgress?.replace('%', '') || '0');

      // Complete first segment by clicking Next
      await page.click('button:has-text("Next")');
      await page.waitForTimeout(500);

      // Get new progress percentage
      const newProgress = await page.locator('.progress-header span').last().textContent();
      const newPercent = parseInt(newProgress?.replace('%', '') || '0');

      // Progress should increase
      expect(newPercent).toBeGreaterThan(initialPercent);
    });

    test('should show visual progress bar fill', async ({ page }) => {
      await page.goto('/');

      await page.fill('#url-input', SIMPLE_ARTICLE);
      await page.click('button[type="submit"]');
      await page.waitForSelector('.progress-panel', { timeout: 30000 });

      // Get initial progress bar width
      const initialWidth = await page.evaluate(() => {
        const progressBar = document.querySelector('.progress-value');
        return progressBar ? progressBar.clientWidth : 0;
      });

      // Complete first segment
      await page.click('button:has-text("Next")');
      await page.waitForTimeout(500);

      // Get new progress bar width
      const newWidth = await page.evaluate(() => {
        const progressBar = document.querySelector('.progress-value');
        return progressBar ? progressBar.clientWidth : 0;
      });

      // Progress bar should grow
      expect(newWidth).toBeGreaterThan(initialWidth);
    });

    test('should mark segment items as completed', async ({ page }) => {
      await page.goto('/');

      await page.fill('#url-input', SIMPLE_ARTICLE);
      await page.click('button[type="submit"]');
      await page.waitForSelector('.progress-panel', { timeout: 30000 });

      // Check first segment item class
      const firstSegment = page.locator('.segment-item').first();
      const initialClass = await firstSegment.getAttribute('class');
      expect(initialClass).toContain('active');

      // Complete first segment
      await page.click('button:has-text("Next")');
      await page.waitForTimeout(500);

      // First segment should now be marked as completed
      const completedClass = await firstSegment.getAttribute('class');
      expect(completedClass).toContain('completed');

      // Should have checkmark
      const checkmark = firstSegment.locator('.segment-check');
      await expect(checkmark).toBeVisible();
    });

    test('should turn segment bars green as progress moves forward', async ({ page }) => {
      await page.goto('/');

      await page.fill('#url-input', SIMPLE_ARTICLE);
      await page.click('button[type="submit"]');
      await page.waitForSelector('.progress-panel', { timeout: 30000 });

      // Get first segment item background color (should be active blue)
      const firstSegment = page.locator('.segment-item').first();
      const activeColor = await firstSegment.evaluate((el) => {
        return window.getComputedStyle(el).backgroundColor;
      });

      // Complete first segment
      await page.click('button:has-text("Next")');
      await page.waitForTimeout(500);

      // Get first segment item background color (should be completed green)
      const completedColor = await firstSegment.evaluate((el) => {
        return window.getComputedStyle(el).backgroundColor;
      });

      // Color should change from blue/active to green/completed
      expect(completedColor).not.toBe(activeColor);

      // Completed should have green color (rgba format, check for higher green component)
      const rgbMatch = completedColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (rgbMatch) {
        const [, r, g, b] = rgbMatch.map(Number);
        // Green component should be significantly higher than red/blue for green color
        expect(g).toBeGreaterThan(r);
        expect(g).toBeGreaterThan(b);
      }
    });

    test('should persist progress across page reloads', async ({ page }) => {
      await page.goto('/');

      await page.fill('#url-input', SIMPLE_ARTICLE);
      await page.click('button[type="submit"]');
      await page.waitForSelector('.progress-panel', { timeout: 30000 });

      // Complete two segments
      await page.click('button:has-text("Next")');
      await page.waitForTimeout(500);
      await page.click('button:has-text("Next")');
      await page.waitForTimeout(500);

      // Get current segment number
      const segmentText = await page.locator('.segment-header span').last().textContent();
      expect(segmentText).toContain('Segment 3');

      // Get current URL
      const currentUrl = page.url();

      // Reload page with same URL
      await page.goto(currentUrl);
      await page.waitForSelector('.progress-panel', { timeout: 5000 });

      // Should still be on segment 3
      const reloadedSegmentText = await page.locator('.segment-header span').last().textContent();
      expect(reloadedSegmentText).toContain('Segment 3');

      // Completed segments should still be marked
      const completedSegments = page.locator('.segment-item.completed');
      const completedCount = await completedSegments.count();
      expect(completedCount).toBeGreaterThanOrEqual(2);
    });
  });

  test.describe('Segment List Navigation', () => {
    test('should allow clicking segment items to jump to that segment', async ({ page }) => {
      await page.goto('/');

      await page.fill('#url-input', SIMPLE_ARTICLE);
      await page.click('button[type="submit"]');
      await page.waitForSelector('.progress-panel', { timeout: 30000 });

      // Get segment count
      const segmentCount = await page.locator('.segment-item').count();
      expect(segmentCount).toBeGreaterThan(2);

      // Click on third segment item if it exists
      if (segmentCount >= 3) {
        await page.locator('.segment-item').nth(2).click();
        await page.waitForTimeout(500);

        // Should now be on segment 3
        const segmentText = await page.locator('.segment-header span').last().textContent();
        expect(segmentText).toContain('Segment 3');

        // Third segment should be active
        const thirdSegment = page.locator('.segment-item').nth(2);
        const className = await thirdSegment.getAttribute('class');
        expect(className).toContain('active');
      }
    });
  });
});
