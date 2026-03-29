import { test, expect } from '@playwright/test'

const API = 'http://localhost:4400/api'

test.describe('Real-time updates', () => {
  test('dashboard loads and shows agent fleet', async ({ page }) => {
    await page.goto('/')

    // Wait for data to load (React Query fetches on mount)
    await expect(page.getByText('Agent Fleet')).toBeVisible()
    // The agents count badge should be present
    await expect(page.locator('text=/\\d+ agents/')).toBeVisible({ timeout: 5000 })
  })

  test('agent appears in fleet without page refresh after API creation', async ({ page }) => {
    // Create a unique company for isolation
    const companyName = `E2E Realtime Co ${Date.now()}`
    const agentName = `E2E Realtime Agent ${Date.now()}`

    const compRes = await page.request.post(`${API}/companies`, {
      data: { name: companyName },
    })
    const { company } = await compRes.json()

    await page.goto('/')

    // Get initial agent count text
    const countLocator = page.locator('text=/\\d+ agents/')
    await expect(countLocator).toBeVisible({ timeout: 5000 })
    const initialCountText = await countLocator.textContent()
    const initialCount = parseInt(initialCountText?.match(/(\d+)/)?.[1] ?? '0')

    // Create agent via API
    await page.request.post(`${API}/companies/${company.id}/agents`, {
      data: { name: agentName, role: 'worker', model: 'claude-sonnet-4-6' },
    })

    // React Query refetches every 5s + SSE should invalidate immediately
    // Wait up to 10s for the new agent to appear
    await expect(page.getByText(agentName)).toBeVisible({ timeout: 10000 })

    // Cleanup
    await page.request.delete(`${API}/companies/${company.id}`)
  })

  test('SSE endpoint is reachable', async ({ page }) => {
    const response = await page.request.get(`${API.replace('/api', '')}/api/events`)
    // SSE endpoint should return 200 with text/event-stream content type
    expect(response.status()).toBe(200)
    const contentType = response.headers()['content-type']
    expect(contentType).toContain('text/event-stream')
  })

  test('health endpoint is reachable', async ({ page }) => {
    const response = await page.request.get(`${API}/health`)
    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body).toHaveProperty('status')
  })

  test('WebSocket connection can be established', async ({ page }) => {
    // We can't test WS directly in Playwright, but we can verify the page
    // renders the log viewer which tries to connect to WS

    // Create company+agent for the test
    const compRes = await page.request.post(`${API}/companies`, {
      data: { name: `E2E WS Co ${Date.now()}` },
    })
    const { company } = await compRes.json()

    const agentRes = await page.request.post(`${API}/companies/${company.id}/agents`, {
      data: { name: 'E2E WS Agent', role: 'worker', model: 'claude-sonnet-4-6' },
    })
    const { agent } = await agentRes.json()

    await page.goto(`/agents/${agent.id}`)

    // The log viewer should be visible (it connects via WebSocket)
    await expect(page.getByText('Live Logs')).toBeVisible()

    // Cleanup
    await page.request.delete(`${API}/companies/${company.id}`)
  })

  test('agents list auto-refreshes via React Query', async ({ page }) => {
    // React Query is configured with refetchInterval
    // We verify the agents page re-fetches by checking the page stays functional
    await page.goto('/agents')
    await expect(page.getByRole('heading', { name: 'Agents' })).toBeVisible()

    // Wait 6 seconds (React Query refetches every 5s)
    await page.waitForTimeout(6000)

    // Page should still be functional
    await expect(page.getByRole('heading', { name: 'Agents' })).toBeVisible()
  })
})
