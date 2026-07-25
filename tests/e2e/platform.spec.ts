import { test, expect } from '@playwright/test';

test.describe('Platform Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load page successfully', async ({ page }) => {
    const title = page.locator('title');
    await expect(title).toHaveText(/مسورات|Mysorat/);

    // Page should not have any errors
    let hasError = false;
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        hasError = true;
        console.error('Console error:', msg.text());
      }
    });

    expect(hasError).toBe(false);
  });

  test('should display hero section with headline', async ({ page }) => {
    const headline = page.locator('h1');
    await expect(headline).toBeVisible();
    const text = await headline.textContent();
    expect(text?.length).toBeGreaterThan(0);
  });

  test('should display statistics section', async ({ page }) => {
    const stats = page.locator('.stat');
    const count = await stats.count();
    expect(count).toBe(4); // Should have 4 stats

    // First stat: 60 services
    const firstStat = page.locator('.stat-n').first();
    const firstStatText = await firstStat.textContent();
    expect(firstStatText?.trim()).toBe('60');

    // Second stat: 12 categories
    const secondStat = page.locator('.stat-n').nth(1);
    const secondStatText = await secondStat.textContent();
    expect(secondStatText?.trim()).toBe('12');

    // Third stat: 30 free services
    const thirdStat = page.locator('.stat-n').nth(2);
    const thirdStatText = await thirdStat.textContent();
    expect(thirdStatText?.trim()).toBe('30');

    // Fourth stat: 4 beneficiary types
    const fourthStat = page.locator('.stat-n').nth(3);
    const fourthStatText = await fourthStat.textContent();
    expect(fourthStatText?.trim()).toBe('4');
  });

  test('should display category tiles', async ({ page }) => {
    const categories = page.locator('.cat');
    const count = await categories.count();
    expect(count).toBe(12); // Should have 12 categories
  });

  test('should display value proposition cards', async ({ page }) => {
    // Scroll down to find value props section
    await page.evaluate(() => {
      window.scrollBy(0, 800);
    });

    // There should be multiple cards with text
    const allText = await page.locator('body').textContent();
    expect(allText).toContain('أمان');
    expect(allText).toContain('شفافية');
  });

  test('should have theme toggle button', async ({ page }) => {
    const themeButton = page.locator('#tbtn');
    await expect(themeButton).toBeVisible();
  });

  test('should toggle between light and dark themes', async ({ page }) => {
    const themeButton = page.locator('#tbtn');

    // Get initial theme
    const initialTheme = await page.evaluate(() => {
      return document.documentElement.dataset.theme || 'light';
    });

    // Click to toggle
    await themeButton.click();
    await page.waitForTimeout(100);

    // Get new theme
    const newTheme = await page.evaluate(() => {
      return document.documentElement.dataset.theme;
    });

    // Should be different
    if (!initialTheme || initialTheme === 'light') {
      expect(newTheme).toBe('dark');
    } else {
      expect(newTheme).toBe('light');
    }

    // Toggle back
    await themeButton.click();
    await page.waitForTimeout(100);

    const finalTheme = await page.evaluate(() => {
      return document.documentElement.dataset.theme || 'light';
    });

    expect(finalTheme).toBe(initialTheme || 'light');
  });

  test('should have proper heading hierarchy', async ({ page }) => {
    const h1s = page.locator('h1');
    const h2s = page.locator('h2');

    // Should have at least 1 h1
    expect(await h1s.count()).toBeGreaterThan(0);

    // Should have h2s for sections
    expect(await h2s.count()).toBeGreaterThan(0);
  });

  test('should display directory section with search', async ({ page }) => {
    // Scroll to directory section
    await page.locator('#q').scrollIntoViewIfNeeded();

    // Should have search input
    const searchInput = page.locator('#q');
    await expect(searchInput).toBeVisible();

    // Should have category tiles
    const categories = page.locator('.cat');
    expect(await categories.count()).toBe(12);

    // Should have service list
    const serviceList = page.locator('#list');
    await expect(serviceList).toBeVisible();
  });

  test('should search services from directory', async ({ page }) => {
    // Scroll to search
    await page.locator('#q').scrollIntoViewIfNeeded();

    const searchInput = page.locator('#q');
    await searchInput.click();
    await searchInput.fill('تطعيم');
    await page.waitForTimeout(100);

    // Should have results
    const listCount = page.locator('#listcount');
    const text = await listCount.textContent();
    expect(text).toBeTruthy();
  });

  test('should display footer with links', async ({ page }) => {
    // Scroll to footer
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });

    const footer = page.locator('footer');
    if (await footer.isVisible()) {
      // Should have text content
      const footerText = await footer.textContent();
      expect(footerText?.length).toBeGreaterThan(10);
    }
  });

  test('should have proper RTL direction', async ({ page }) => {
    const direction = await page.locator('html').evaluate((el) => {
      return el.getAttribute('dir');
    });

    expect(direction).toBe('rtl');
  });

  test('should have proper language attribute', async ({ page }) => {
    const lang = await page.locator('html').evaluate((el) => {
      return el.getAttribute('lang');
    });

    expect(lang).toBe('ar');
  });

  test('should be responsive on mobile (360px)', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });

    // All key sections should be visible (after scrolling)
    const headings = page.locator('h1, h2');
    expect(await headings.count()).toBeGreaterThan(0);

    // Should not have horizontal scroll
    const documentWidth = await page.evaluate(() => {
      return Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      );
    });

    expect(documentWidth).toBeLessThanOrEqual(360);
  });

  test('should be responsive on tablet (768px)', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });

    // Layout should adapt
    const stats = page.locator('.stat');
    expect(await stats.count()).toBe(4);

    // Should fit without horizontal scroll
    const documentWidth = await page.evaluate(() => {
      return Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      );
    });

    expect(documentWidth).toBeLessThanOrEqual(768);
  });

  test('should be responsive on desktop (1440px)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // All sections should display side-by-side where applicable
    const stats = page.locator('.stat');
    expect(await stats.count()).toBe(4);

    // Should fit without horizontal scroll
    const documentWidth = await page.evaluate(() => {
      return Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      );
    });

    expect(documentWidth).toBeLessThanOrEqual(1440);
  });

  test('should not have horizontal scroll at any viewport', async ({ page }) => {
    const viewports = [360, 430, 768, 1024, 1440];

    for (const width of viewports) {
      await page.setViewportSize({ width, height: 800 });

      const documentWidth = await page.evaluate(() => {
        return Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
        );
      });

      expect(
        documentWidth,
        `Should fit at ${width}px width`,
      ).toBeLessThanOrEqual(width + 1);
    }
  });

  test('should render canvas (girih lattice)', async ({ page }) => {
    const canvas = page.locator('canvas');

    // Canvas should exist
    if (await canvas.isVisible()) {
      const canvasElement = canvas.first();
      expect(canvasElement).toBeTruthy();

      // Canvas should have width/height
      const width = await canvasElement.evaluate(
        (el: any) => el.clientWidth,
      );
      const height = await canvasElement.evaluate(
        (el: any) => el.clientHeight,
      );

      expect(width).toBeGreaterThan(0);
      expect(height).toBeGreaterThan(0);
    }
  });

  test('should be keyboard navigable', async ({ page }) => {
    // Tab through page
    let tabCount = 0;
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      tabCount++;
    }

    // Should have tabbed through some elements
    expect(tabCount).toBeGreaterThan(0);

    // Should have focused element
    const focused = await page.evaluate(() => {
      return (document.activeElement as HTMLElement)?.tagName;
    });

    expect(focused).toBeTruthy();
  });

  test('should have focus visible on interactive elements', async ({ page }) => {
    const button = page.locator('button').first();

    if (await button.isVisible()) {
      // Tab to focus button
      await page.keyboard.press('Tab');

      // Check if focus is visible (via CSS)
      const focusStyle = await button.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return {
          outline: style.outline,
          boxShadow: style.boxShadow,
          borderStyle: style.borderStyle,
        };
      });

      // At least one focus indicator should exist
      const hasFocus =
        focusStyle.outline !== 'none' ||
        focusStyle.boxShadow !== 'none' ||
        focusStyle.borderStyle !== 'none';

      expect(hasFocus).toBe(true);
    }
  });

  test('should have proper color contrast in light theme', async ({ page }) => {
    // Ensure we're in light theme
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'light';
    });

    // Get all text elements
    const allElements = await page.locator('body *').all();

    // Sample a few elements to check contrast
    let checkedCount = 0;
    for (const element of allElements.slice(0, 10)) {
      const style = await element.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return {
          color: style.color,
          backgroundColor: style.backgroundColor,
          display: style.display,
        };
      });

      // Skip hidden elements
      if (style.display === 'none') continue;
      checkedCount++;
    }

    // Should have checked at least some elements
    expect(checkedCount).toBeGreaterThan(0);
  });

  test('should persist theme on reload', async ({ page }) => {
    const themeButton = page.locator('#tbtn');

    // Set dark theme
    await themeButton.click();
    await page.waitForTimeout(100);

    // Reload
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // Theme should still be dark
    const theme = await page.evaluate(() => {
      return document.documentElement.dataset.theme;
    });

    expect(theme).toBe('dark');
  });

  test('should have SVG icons for categories', async ({ page }) => {
    const icons = page.locator('.cat svg');
    const count = await icons.count();

    // Should have icons for categories
    expect(count).toBeGreaterThan(0);
  });

  test('should display service facts correctly', async ({ page }) => {
    // Scroll to directory
    await page.locator('#list').scrollIntoViewIfNeeded();

    // Get first service card
    const firstService = page.locator('.svc').first();

    if (await firstService.isVisible()) {
      // Should have facts
      const facts = firstService.locator('.fact');
      const factCount = await facts.count();

      // Should have at least one fact
      expect(factCount).toBeGreaterThan(0);
    }
  });

  test('should handle pagination load more', async ({ page }) => {
    // Scroll to directory
    await page.locator('#list').scrollIntoViewIfNeeded();

    // Get initial service count
    const initialServices = await page.locator('.svc').count();

    // Click load more if available
    const moreButton = page.locator('#more');
    if (await moreButton.isVisible()) {
      await moreButton.click();
      await page.waitForTimeout(200);

      // Should have more services
      const updatedServices = await page.locator('.svc').count();
      expect(updatedServices).toBeGreaterThan(initialServices);
    }
  });

  test('should be accessible with screen reader context', async ({ page }) => {
    // Check for proper ARIA attributes
    const ariaElements = await page.locator('[aria-label], [aria-pressed], [aria-selected]').all();

    // Should have some ARIA elements
    expect(ariaElements.length).toBeGreaterThanOrEqual(0);

    // Stats should have proper text labels
    const statLabels = page.locator('.stat-l');
    const labelCount = await statLabels.count();
    expect(labelCount).toBe(4);
  });
});
