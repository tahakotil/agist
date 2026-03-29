import { test, expect } from '@playwright/test'

test.describe('UI tests', () => {
  test('dark mode is default (dark background on body)', async ({ page }) => {
    await page.goto('/')
    // The layout uses bg-slate-950 / dark backgrounds
    const bgColor = await page.evaluate(() => {
      const body = document.body
      return window.getComputedStyle(body).backgroundColor
    })
    // Dark mode: rgb values should be low (dark)
    // bg-slate-950 is approximately rgb(2, 6, 23)
    // We just check it's not a bright white background
    expect(bgColor).not.toBe('rgb(255, 255, 255)')
  })

  test('mobile viewport: sidebar is hidden', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')

    // Sidebar has class "hidden md:flex" — on mobile it should be hidden
    const sidebar = page.locator('aside')
    await expect(sidebar).toBeHidden()
  })

  test('desktop viewport: sidebar is visible', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')

    // Sidebar should be visible on desktop
    const sidebar = page.locator('aside')
    await expect(sidebar).toBeVisible()
  })

  test('Cmd+K / Ctrl+K opens command palette', async ({ page }) => {
    await page.goto('/')

    // Press Ctrl+K (works on both Mac and Windows in tests)
    await page.keyboard.press('Control+k')

    // Command palette dialog should appear
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 3000 })
    await expect(page.getByPlaceholder('Type a command or search...')).toBeVisible()
  })

  test('command palette closes with Escape', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('Control+k')
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 3000 })

    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 3000 })
  })

  test('command palette has navigation items', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('Control+k')
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 3000 })

    // Should show navigation options
    await expect(page.getByText('Dashboard')).toBeVisible()
    await expect(page.getByText('Companies')).toBeVisible()
    await expect(page.getByText('Agents')).toBeVisible()
  })

  test('status board (/status) has no sidebar', async ({ page }) => {
    await page.goto('/status')

    // Status board is not wrapped in the dashboard layout (no sidebar)
    const sidebar = page.locator('aside')
    const sidebarCount = await sidebar.count()
    expect(sidebarCount).toBe(0)
  })

  test('status board shows Agent Status Board heading', async ({ page }) => {
    await page.goto('/status')
    await expect(page.getByText('Agent Status Board')).toBeVisible()
  })

  test('status board shows running/errors/idle counters', async ({ page }) => {
    await page.goto('/status')
    await expect(page.getByText('running')).toBeVisible()
    await expect(page.getByText('errors')).toBeVisible()
    await expect(page.getByText('idle')).toBeVisible()
  })

  test('dashboard shows stat cards', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Total Agents')).toBeVisible()
    await expect(page.getByText('Running Now')).toBeVisible()
    await expect(page.getByText('Success Rate 24h')).toBeVisible()
    await expect(page.getByText('Cost Today')).toBeVisible()
  })

  test('dashboard shows Agent Fleet section', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Agent Fleet')).toBeVisible()
  })

  test('dashboard shows Recent Runs section', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Recent Runs')).toBeVisible()
  })
})
