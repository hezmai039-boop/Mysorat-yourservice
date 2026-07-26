import { test, expect } from '@playwright/test';

test.describe('Directory Page', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to platform page that has embedded directory
    await page.goto('/');
    // Scroll to directory section
    await page.locator('id=cats').scrollIntoViewIfNeeded();
  });

  test('should display all 60 services initially', async ({ page }) => {
    const serviceCards = page.locator('.svc');
    const count = await serviceCards.count();
    expect(count).toBe(12); // Initial load is 12, load more for rest

    // Total should match SERVICES.length
    const listCount = page.locator('#listcount');
    await expect(listCount).toContainText('60 خدمة');
  });

  test('should display all 12 category tiles', async ({ page }) => {
    const categoryTiles = page.locator('.cat');
    const count = await categoryTiles.count();
    expect(count).toBe(12);
  });

  test('should filter by category when clicked', async ({ page }) => {
    // Click "الإقامة والجوازات" category
    const residencyCategory = page.locator('.cat', {
      has: page.locator('text=الإقامة والجوازات'),
    });
    await residencyCategory.click();

    // Verify filter applied
    const listTitle = page.locator('#listtitle');
    await expect(listTitle).toContainText('الإقامة والجوازات');

    // Verify service count is less than 60
    const listCount = page.locator('#listcount');
    const text = await listCount.textContent();
    const match = text?.match(/\d+/);
    const count = match ? parseInt(match[0]) : 0;
    expect(count).toBeLessThan(60);
    expect(count).toBeGreaterThan(0);
  });

  test('should clear filter when clicking category again', async ({ page }) => {
    const residencyCategory = page.locator('.cat', {
      has: page.locator('text=الإقامة والجوازات'),
    });

    // Click to filter
    await residencyCategory.click();
    let listTitle = page.locator('#listtitle');
    await expect(listTitle).toContainText('الإقامة والجوازات');

    // Click again to clear
    await residencyCategory.click();
    listTitle = page.locator('#listtitle');
    await expect(listTitle).toContainText('كل الخدمات');
  });

  test('should search for services with Arabic normalization', async ({ page }) => {
    const searchInput = page.locator('#q');

    // Test 1: Search "اقامة" (without hamza)
    await searchInput.click();
    await searchInput.fill('اقامة');
    await page.waitForTimeout(100); // Allow filter time

    let resultCount = page.locator('#listcount');
    let countText = await resultCount.textContent();
    let match = countText?.match(/\d+/);
    let count1 = match ? parseInt(match[0]) : 0;
    expect(count1).toBeGreaterThan(0);

    // Test 2: Search "إقامة" (with hamza)
    await searchInput.clear();
    await searchInput.fill('إقامة');
    await page.waitForTimeout(100);

    resultCount = page.locator('#listcount');
    countText = await resultCount.textContent();
    match = countText?.match(/\d+/);
    let count2 = match ? parseInt(match[0]) : 0;

    // Both should find same results due to normalization
    expect(count1).toBe(count2);
  });

  test('should search in English', async ({ page }) => {
    const searchInput = page.locator('#q');
    await searchInput.click();
    await searchInput.fill('passport');
    await page.waitForTimeout(100);

    const resultCount = page.locator('#listcount');
    await expect(resultCount).toContainText('1 خدمة');
  });

  test('should show "no results" when search matches nothing', async ({ page }) => {
    const searchInput = page.locator('#q');
    await searchInput.click();
    await searchInput.fill('xyz123nonexistent');
    await page.waitForTimeout(100);

    const emptyMessage = page.locator('text=لا توجد خدمة مطابقة');
    await expect(emptyMessage).toBeVisible();
  });

  test('should handle pagination with "load more"', async ({ page }) => {
    // Clear any filters
    await page.locator('#clear').click({ force: true });

    // Initial load should have 12 items
    let serviceCards = page.locator('.svc');
    let initialCount = await serviceCards.count();
    expect(initialCount).toBe(12);

    // Load more button should be visible
    const moreButton = page.locator('#more');
    await expect(moreButton).toBeVisible();

    // Click to load more
    await moreButton.click();
    await page.waitForTimeout(100);

    serviceCards = page.locator('.svc');
    let afterLoadCount = await serviceCards.count();
    expect(afterLoadCount).toBe(24);
  });

  test('should display service card details correctly', async ({ page }) => {
    // Find first service card
    const firstCard = page.locator('.svc').first();

    // Should have service name (ar)
    const serviceName = firstCard.locator('.svc-name');
    const nameText = await serviceName.textContent();
    expect(nameText).toBeTruthy();
    expect(nameText?.length).toBeGreaterThan(2);

    // Should have facts (at least one)
    const facts = firstCard.locator('.fact');
    const factCount = await facts.count();
    expect(factCount).toBeGreaterThan(0);
  });

  test('should have category border color matching category', async ({ page }) => {
    const firstCard = page.locator('.svc').first();

    // Get the color variable
    const borderStyle = await firstCard.evaluate((el) => {
      return window.getComputedStyle(el).getPropertyValue('--c');
    });

    // Should be a hex color
    expect(borderStyle).toMatch(/#[0-9A-Fa-f]{6}/);
  });

  test('should persist search when switching themes', async ({ page }) => {
    const searchInput = page.locator('#q');
    await searchInput.click();
    await searchInput.fill('تطعيم');
    await page.waitForTimeout(100);

    // Toggle theme
    const themeToggle = page.locator('#tbtn');
    await themeToggle.click();
    await page.waitForTimeout(100);

    // Search should still be there
    const searchValue = await searchInput.inputValue();
    expect(searchValue).toBe('تطعيم');

    // Results should still be visible
    const resultCount = page.locator('#listcount');
    const countText = await resultCount.textContent();
    expect(countText).toBeTruthy();
  });

  test('should show theme toggle button', async ({ page }) => {
    const themeToggle = page.locator('#tbtn');
    await expect(themeToggle).toBeVisible();
  });

  test('should apply dark theme when toggled', async ({ page }) => {
    const themeToggle = page.locator('#tbtn');

    // Get initial theme value
    const initialTheme = await page.evaluate(() => {
      return document.documentElement.dataset.theme || 'light';
    });

    // Click toggle
    await themeToggle.click();
    await page.waitForTimeout(100);

    // Theme should change
    const newTheme = await page.evaluate(() => {
      return document.documentElement.dataset.theme;
    });

    // Should be opposite of initial
    if (initialTheme === 'light' || !initialTheme) {
      expect(newTheme).toBe('dark');
    } else {
      expect(newTheme).toBe('light');
    }
  });

  test('should be responsive on mobile (360px)', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });

    const body = page.locator('body');
    const boundingBox = await body.boundingBox();

    // Should not have horizontal scroll
    expect(boundingBox?.width).toBeLessThanOrEqual(360);

    // Category tiles should still be visible
    const categoryTiles = page.locator('.cat');
    const firstTile = categoryTiles.first();
    await expect(firstTile).toBeVisible();
  });

  test('should be responsive on tablet (768px)', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });

    const serviceGrid = page.locator('#list');
    const gridStyle = await serviceGrid.evaluate((el) => {
      return window.getComputedStyle(el).display;
    });

    // Should be grid layout
    expect(['grid', 'inline-grid']).toContain(gridStyle);
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

      expect(documentWidth).toBeLessThanOrEqual(width);
    }
  });
});
