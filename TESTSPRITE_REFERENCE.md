# testsprite — Visual Regression Testing Reference
**Reference Guide for Continuous Visual Quality**

---

## What is testsprite?

**testsprite** is a visual regression testing tool that:
- Captures screenshots of web pages at different viewport sizes
- Compares new screenshots against baseline versions
- Detects unintended visual changes
- Generates diff reports highlighting what changed

**Use case**: Detect when CSS, layout, or responsive design breaks after code changes.

---

## Why Use testsprite?

| Problem | Solution |
|---------|----------|
| Font changes break Arabic diacritics | Visual test catches it immediately |
| CSS refactor accidentally changes button colors | Diff highlights the change |
| Theme toggle breaks dark mode | testsprite detects color changes |
| Responsive breakpoint shifts the layout | Screenshot compares all viewport sizes |
| A11y contrast regresses | Visual regression shows low-contrast text |

---

## Setup (One-Time)

### 1. Install testsprite

```bash
npm install --save-dev testsprite
```

### 2. Create testsprite.config.js

```javascript
export default {
  // Web server to test
  baseUrl: "http://localhost:5173",

  // Pages to test
  pages: [
    {
      name: "directory-light",
      url: "/",
      setup: async (page) => {
        // Light theme (default)
        await page.evaluate(() => {
          document.documentElement.dataset.theme = "light";
        });
      },
    },
    {
      name: "directory-dark",
      url: "/",
      setup: async (page) => {
        // Dark theme
        await page.evaluate(() => {
          document.documentElement.dataset.theme = "dark";
        });
      },
    },
    {
      name: "platform",
      url: "/",
      // Full page default
    },
  ],

  // Viewport sizes to test
  breakpoints: [
    { name: "mobile", width: 360, height: 800 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "desktop", width: 1024, height: 900 },
    { name: "wide", width: 1440, height: 900 },
  ],

  // Pixel difference tolerance (1% = some anti-aliasing allowed)
  diffThreshold: 0.01,

  // Browser to use (Playwright available)
  browsers: ["chromium"],

  // Output directory
  outputDir: "./testsprite",

  // Baseline directory
  baselineDir: "./testsprite/baselines",

  // Diff directory (visual reports)
  diffDir: "./testsprite/diffs",
};
```

### 3. Verify setup

```bash
npx testsprite --version
# testsprite 1.x.x

# Ensure Chromium is available
export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
ls $PLAYWRIGHT_BROWSERS_PATH/chromium
```

---

## Workflow

### Phase 1: Capture Baselines

**Goal**: Record "correct" screenshots to compare against

```bash
# Step 1: Start dev server
cd frontend
npm run dev &

# Step 2: Capture baselines (in new terminal)
cd /home/user/Mysorat-yourservice
npx testsprite baseline

# Output:
# ✓ directory-light-360.png
# ✓ directory-light-768.png
# ✓ directory-light-1024.png
# ✓ directory-light-1440.png
# ✓ directory-dark-360.png
# ✓ directory-dark-768.png
# ✓ directory-dark-1024.png
# ✓ directory-dark-1440.png
# ✓ platform-360.png
# ✓ platform-768.png
# ✓ platform-1024.png
# ✓ platform-1440.png
```

### Phase 2: Make Code Changes

```bash
# Edit CSS, layouts, components, etc.
nano frontend/src/pages/Services.tsx
# ... make changes ...

# Build
npm run build
```

### Phase 3: Capture New Screenshots and Compare

```bash
# Run testsprite test (compares against baselines)
npx testsprite test

# Output 1: No differences found
# ✓ directory-light-360: No diff
# ✓ directory-light-768: No diff
# ✓ directory-dark-360: No diff
# ... all PASS

# Output 2: Differences found
# ✓ directory-light-360: No diff
# ⚠️  directory-light-768: 2.3% diff found → testsprite/diffs/directory-light-768.png
# ⚠️  directory-dark-768: 5.1% diff found → testsprite/diffs/directory-dark-768.png
# ✗ platform-1024: 15% diff exceeds threshold → FAIL
```

---

## Interpreting Diff Reports

### Example 1: No Difference (✓ PASS)

```
directory-light-360: No diff
```

**Meaning**: New screenshot pixel-for-pixel identical to baseline.
**Action**: Continue (no visual regression).

### Example 2: Minor Difference (⚠️ REVIEW)

```
directory-light-768: 2.3% diff found
Diff saved to: testsprite/diffs/directory-light-768.png
```

**Meaning**: ~2% of pixels changed (e.g., anti-aliasing, slight color shift).
**Action**:
1. Open `testsprite/diffs/directory-light-768.png`
2. Look for red/highlighted areas showing what changed
3. Decide:
   - **Intentional change** (e.g., updated colors): Approve it
   - **Unintended** (e.g., button moved): Fix code and re-run

### Example 3: Major Difference (✗ FAIL)

```
platform-1024: 15% diff exceeds threshold (1%)
```

**Meaning**: Large portion of page changed.
**Causes**:
- Layout shift (breakpoint changed)
- New/removed content
- Color scheme change
- Theme not loading

**Action**: Investigate and fix before proceeding.

---

## Approving Changes

### Scenario: You Intentionally Changed the UI

```bash
# 1. View the diff to confirm it's what you intended
open testsprite/diffs/directory-light-768.png

# 2. Approve the change (updates baseline)
npx testsprite approve directory-light-768

# 3. Commit updated baseline
git add testsprite/baselines/directory-light-768.png
git commit -m "Update visual baseline for color refinement"
```

### Scenario: Change Was Unintended

```bash
# 1. View the diff to identify what broke
open testsprite/diffs/directory-light-768.png

# 2. Fix the code
nano frontend/src/styles.css
# ... remove bad CSS ...

# 3. Re-run test
npx testsprite test

# 4. If now passing: done!
# 5. If still failing: investigate further
```

---

## Theme Testing Strategy

### Problem

Dark theme screenshots will ALWAYS differ from light theme baselines.

### Solution

Create separate baselines for each theme:

```javascript
// testsprite.config.js

pages: [
  // Light theme (baseline for light)
  {
    name: "directory-light",
    url: "/",
    setup: async (page) => {
      await page.evaluate(() => {
        document.documentElement.dataset.theme = "light";
      });
    },
  },

  // Dark theme (separate baseline for dark)
  {
    name: "directory-dark",
    url: "/",
    setup: async (page) => {
      await page.evaluate(() => {
        document.documentElement.dataset.theme = "dark";
      });
    },
  },
];
```

### Result

- `directory-light-360.png` compared against `directory-light-360.png`
- `directory-dark-360.png` compared against `directory-dark-360.png`
- Color differences between light/dark are expected (not reported as regression)

---

## Responsive Breakpoint Strategy

### Standard breakpoints to test

| Name | Width | Use Case |
|------|-------|----------|
| mobile | 360px | iPhone SE |
| mobile-plus | 430px | iPhone 14/15 |
| tablet | 768px | iPad |
| desktop | 1024px | Laptop |
| wide | 1440px | Desktop HD |

### Configuration

```javascript
breakpoints: [
  { name: "mobile", width: 360, height: 800 },
  { name: "mobile-plus", width: 430, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1024, height: 900 },
  { name: "wide", width: 1440, height: 900 },
];
```

### Example: Media query change

**Before**:
```css
/* Mobile: 1 column */
@media (max-width: 768px) { #list { grid-template-columns: 1fr; } }

/* Tablet+: 2 columns */
@media (min-width: 769px) { #list { grid-template-columns: 1fr 1fr; } }
```

**After**:
```css
/* Mobile: 1 column */
@media (max-width: 767px) { #list { grid-template-columns: 1fr; } }  /* Changed: 768 → 767 */

/* Tablet+: 2 columns */
@media (min-width: 768px) { #list { grid-template-columns: 1fr 1fr; } }
```

**testsprite Report**:
```
directory-light-768: 45% diff found (grid layout changed from 1 to 2 columns)
```

✅ This is expected and should be approved.

---

## Common testsprite Commands

```bash
# Capture baselines
npx testsprite baseline

# Run test (compare against baselines)
npx testsprite test

# Run with specific page
npx testsprite test --page directory-light

# Run specific viewport
npx testsprite test --breakpoint mobile

# Approve a diff
npx testsprite approve directory-light-768

# View all diffs (HTML report)
npx testsprite report

# Clean old diffs
npx testsprite clean
```

---

## CI/CD Integration (GitHub Actions Example)

```yaml
name: Visual Regression Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: 18

      - name: Install dependencies
        run: npm install

      - name: Build frontend
        run: cd frontend && npm run build

      - name: Install browsers
        run: npx playwright install chromium

      - name: Start server & run tests
        run: |
          cd frontend
          npm run dev &
          sleep 3
          cd ..
          npx testsprite test

      - name: Upload diffs on failure
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: testsprite-diffs
          path: testsprite/diffs/

      - name: Comment PR with results
        if: failure()
        uses: actions/github-script@v6
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '❌ Visual regression detected. Check artifacts for diffs.'
            })
```

---

## Troubleshooting testsprite

### Problem: "Cannot find baseline"

```
Error: baseline/directory-light-360.png not found
```

**Solution**: Capture baselines first
```bash
npx testsprite baseline
```

### Problem: "Diff exceeds threshold"

```
directory-light-768: 25% diff found (exceeds 1%)
```

**Solution 1**: It's real (layout broke) — fix code
**Solution 2**: Increase threshold temporarily
```javascript
// testsprite.config.js
diffThreshold: 0.05,  // 5% tolerance (if needed for anti-aliasing)
```

**Solution 3**: Approve if intentional
```bash
npx testsprite approve directory-light-768
```

### Problem: Screenshots look blurry

**Cause**: DPI mismatch
**Solution**: Force DPR (device pixel ratio)
```javascript
pages: [
  {
    name: "directory-light",
    url: "/",
    setup: async (page) => {
      await page.evaluate(() => {
        Object.defineProperty(window, 'devicePixelRatio', {
          value: 1  // Force 1x DPI
        });
      });
    },
  },
];
```

### Problem: Fonts look different in CI

**Cause**: Different OS has different font rasterization
**Solution**: Embed fonts in @font-face (already done in this project)
```css
@font-face {
  font-family: 'Readex Pro';
  src: url('data:font/woff2;base64,AA...') format('woff2');
}
```

---

## Performance Considerations

- **Speed**: 8 pages × 5 breakpoints = 40 screenshots ≈ 30-60 seconds
- **Storage**: ~20 MB for baselines + diffs
- **Network**: Works offline (no external dependencies)

---

## Best Practices

✅ **DO**:
- Capture baselines after major features
- Approve intentional design changes
- Commit baselines to git (for team collaboration)
- Run before each PR
- Use for regression prevention

❌ **DON'T**:
- Use as your only testing method (pair with unit/e2e tests)
- Approve diffs without reviewing them
- Ignore legitimate visual regressions
- Modify baselines manually (let testsprite do it)
- Commit unapproved diffs

---

## Example: Full Workflow

```bash
# 1. Make a change
nano frontend/src/pages/Services.tsx
# Changed: category tile gradient from 80% to 90% saturation

# 2. Build
npm run build

# 3. Test
npx testsprite test

# Output:
# ⚠️  directory-light-1024: 8% diff found
# ⚠️  directory-dark-1024: 8% diff found
# All others: ✓ Pass

# 4. Review diffs
open testsprite/diffs/directory-light-1024.png
# ✅ Looks good — category tiles are more saturated (intentional)

# 5. Approve
npx testsprite approve directory-light-1024
npx testsprite approve directory-dark-1024

# 6. Commit
git add testsprite/baselines/directory-{light,dark}-1024.png
git commit -m "Increase category tile gradient saturation to 90%"

# 7. Done! Ready to push
git push origin feature-branch
```

---

## Resources

- **testsprite Docs**: https://www.testsprite.io/docs
- **Playwright Screenshots**: https://playwright.dev/docs/api/class-page#page-screenshot
- **Visual Testing Best Practices**: https://www.smashingmagazine.com/2023/10/visual-regression-testing/
- **GitHub Actions Workflow**: https://docs.github.com/en/actions

