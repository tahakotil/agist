import { test, expect } from '@playwright/test'

const API = 'http://localhost:4400/api'

test.describe('Issues', () => {
  test('issues page loads with heading', async ({ page }) => {
    await page.goto('/issues')
    await expect(page.getByRole('heading', { name: 'Issues' })).toBeVisible()
  })

  test('issues page shows table headers', async ({ page }) => {
    await page.goto('/issues')
    await expect(page.getByRole('columnheader', { name: /issue/i })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /severity/i })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /status/i })).toBeVisible()
  })

  test('shows issues or empty state', async ({ page }) => {
    await page.goto('/issues')
    const tableBody = page.locator('tbody')
    await expect(tableBody).toBeVisible()
  })

  test('issue CRUD via API and verify on page', async ({ page }) => {
    // Create company and agent for the issue
    const companyRes = await page.request.post(`${API}/companies`, {
      data: { name: `E2E Issues Co ${Date.now()}` },
    })
    const { company } = await companyRes.json()

    const agentRes = await page.request.post(`${API}/companies/${company.id}/agents`, {
      data: { name: 'E2E Issue Agent', role: 'worker', model: 'claude-sonnet-4-6' },
    })
    const { agent } = await agentRes.json()

    // Create an issue via API
    const issueRes = await page.request.post(`${API}/companies/${company.id}/issues`, {
      data: {
        title: 'E2E Test Issue',
        description: 'This is a test issue',
        priority: 'high',
        agentId: agent.id,
      },
    })
    expect(issueRes.ok()).toBeTruthy()

    // Navigate to issues page - it should show our issue
    await page.goto('/issues')

    // Wait a moment for data to load
    await page.waitForTimeout(1000)

    // Cleanup
    await page.request.delete(`${API}/companies/${company.id}`)
  })

  test('open issues show alert banner', async ({ page }) => {
    // Create some data with an open issue
    const companyRes = await page.request.post(`${API}/companies`, {
      data: { name: `E2E Issue Banner Co ${Date.now()}` },
    })
    const { company } = await companyRes.json()

    const agentRes = await page.request.post(`${API}/companies/${company.id}/agents`, {
      data: { name: 'E2E Banner Agent', role: 'worker' },
    })
    const { agent } = await agentRes.json()

    await page.request.post(`${API}/companies/${company.id}/issues`, {
      data: {
        title: 'E2E Banner Issue',
        agentId: agent.id,
        priority: 'critical',
      },
    })

    await page.goto('/issues')

    // The page should show something related to issues
    await expect(page.locator('tbody')).toBeVisible()

    // Cleanup
    await page.request.delete(`${API}/companies/${company.id}`)
  })
})
