import { test, expect } from '@playwright/test'

test.describe('Navigation', () => {
  test('dashboard loads with heading', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  })

  test('sidebar shows Agist brand', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Agist')).toBeVisible()
  })

  test('navigate to Companies page', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Companies' }).click()
    await expect(page).toHaveURL('/companies')
    await expect(page.getByRole('heading', { name: 'Companies' })).toBeVisible()
  })

  test('navigate to Agents page', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Agents' }).click()
    await expect(page).toHaveURL('/agents')
    await expect(page.getByRole('heading', { name: 'Agents' })).toBeVisible()
  })

  test('navigate to Routines page', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Routines' }).click()
    await expect(page).toHaveURL('/routines')
    await expect(page.getByRole('heading', { name: 'Routines' })).toBeVisible()
  })

  test('navigate to Runs page', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Runs' }).click()
    await expect(page).toHaveURL('/runs')
    await expect(page.getByRole('heading', { name: 'Runs' })).toBeVisible()
  })

  test('navigate to Issues page', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Issues' }).click()
    await expect(page).toHaveURL('/issues')
    await expect(page.getByRole('heading', { name: 'Issues' })).toBeVisible()
  })

  test('navigate to Settings page', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Settings' }).click()
    await expect(page).toHaveURL('/settings')
  })

  test('navigate to Status Board page', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Status Board' }).click()
    await expect(page).toHaveURL('/status')
    await expect(page.getByText('Agent Status Board')).toBeVisible()
  })

  test('all main pages load within 3 seconds', async ({ page }) => {
    const routes = ['/', '/companies', '/agents', '/routines', '/runs', '/issues']
    for (const route of routes) {
      const start = Date.now()
      await page.goto(route)
      const elapsed = Date.now() - start
      expect(elapsed).toBeLessThan(3000)
    }
  })
})
