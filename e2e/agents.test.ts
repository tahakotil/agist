import { test, expect } from '@playwright/test'

const API = 'http://localhost:4400/api'

async function createTestCompany(request: { post: (url: string, options: { data: unknown }) => Promise<{ json: () => Promise<{ company: { id: string } }> }> }, name: string) {
  const res = await request.post(`${API}/companies`, {
    data: { name, description: 'E2E test company' },
  })
  return (await res.json()).company
}

async function cleanupCompany(id: string) {
  await fetch(`${API}/companies/${id}`, { method: 'DELETE' })
}

test.describe('Agents CRUD', () => {
  let companyId: string

  test.beforeEach(async ({ request }) => {
    const company = await createTestCompany(request as Parameters<typeof createTestCompany>[0], `E2E Agent Test Co ${Date.now()}`)
    companyId = company.id
  })

  test.afterEach(async () => {
    if (companyId) {
      await cleanupCompany(companyId)
    }
  })

  test('agents page loads with heading', async ({ page }) => {
    await page.goto('/agents')
    await expect(page.getByRole('heading', { name: 'Agents' })).toBeVisible()
  })

  test('shows empty state or agent list', async ({ page }) => {
    await page.goto('/agents')
    const hasNewButton = await page.getByRole('button', { name: /new agent/i }).isVisible()
    expect(hasNewButton).toBeTruthy()
  })

  test('create agent via UI', async ({ page }) => {
    await page.goto('/agents')

    // Click "New Agent" button
    await page.getByRole('button', { name: /new agent/i }).click()

    // Dialog should open
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'New Agent' })).toBeVisible()

    // Select the company we created (via API, so it's already in the list)
    // The Select component renders a trigger button
    const companySelect = page.locator('select, [role="combobox"]').first()
    await companySelect.click()

    // Wait for dropdown options to appear and select our company
    await page.waitForTimeout(500)
    const companyOptions = page.getByRole('option')
    const count = await companyOptions.count()
    if (count > 0) {
      await companyOptions.first().click()
    }

    // Fill in agent name
    await page.getByPlaceholder('e.g. Marketing Lead').fill('E2E Test Agent')

    // Fill in title
    await page.getByPlaceholder('e.g. Senior Marketing Strategist').fill('Test Title')

    // Submit
    await page.getByRole('button', { name: 'Create Agent' }).click()

    // Dialog should close
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 })
  })

  test('agent appears in agents list after creation via API', async ({ page }) => {
    // Create agent via API
    const res = await page.request.post(`${API}/companies/${companyId}/agents`, {
      data: { name: 'E2E API Agent', role: 'worker', model: 'claude-sonnet-4-6' },
    })
    const { agent } = await res.json()

    await page.goto('/agents')
    await expect(page.getByText('E2E API Agent')).toBeVisible()

    // Model badge should exist
    const badge = page.getByText(/Sonnet|Haiku|Opus/i).first()
    await expect(badge).toBeVisible()

    return agent // for use in other tests
  })

  test('agent table shows status column', async ({ page }) => {
    await page.request.post(`${API}/companies/${companyId}/agents`, {
      data: { name: 'E2E Status Agent', role: 'worker', model: 'claude-sonnet-4-6' },
    })

    await page.goto('/agents')
    // Table headers
    await expect(page.getByRole('columnheader', { name: /status/i })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /model/i })).toBeVisible()
  })

  test('click agent name navigates to agent detail page', async ({ page }) => {
    const res = await page.request.post(`${API}/companies/${companyId}/agents`, {
      data: { name: 'E2E Detail Agent', role: 'worker', model: 'claude-sonnet-4-6' },
    })
    const { agent } = await res.json()

    await page.goto('/agents')
    await page.getByText('E2E Detail Agent').click()
    await expect(page).toHaveURL(`/agents/${agent.id}`)

    // Detail page has the agent name
    await expect(page.getByRole('heading', { name: 'E2E Detail Agent' })).toBeVisible()
  })

  test('agent detail page has Wake button', async ({ page }) => {
    const res = await page.request.post(`${API}/companies/${companyId}/agents`, {
      data: { name: 'E2E Wake Agent', role: 'worker', model: 'claude-sonnet-4-6' },
    })
    const { agent } = await res.json()

    await page.goto(`/agents/${agent.id}`)
    await expect(page.getByRole('button', { name: /wake/i })).toBeVisible()
  })

  test('agent detail page has Pause button', async ({ page }) => {
    const res = await page.request.post(`${API}/companies/${companyId}/agents`, {
      data: { name: 'E2E Pause Agent', role: 'worker', model: 'claude-sonnet-4-6' },
    })
    const { agent } = await res.json()

    await page.goto(`/agents/${agent.id}`)
    await expect(page.getByRole('button', { name: /pause/i })).toBeVisible()
  })

  test('agent detail page shows Live Logs section', async ({ page }) => {
    const res = await page.request.post(`${API}/companies/${companyId}/agents`, {
      data: { name: 'E2E Log Agent', role: 'worker', model: 'claude-sonnet-4-6' },
    })
    const { agent } = await res.json()

    await page.goto(`/agents/${agent.id}`)
    await expect(page.getByText('Live Logs')).toBeVisible()
  })

  test('Wake button opens dialog', async ({ page }) => {
    test.skip(!process.env.AGIST_E2E_FULL, 'Full E2E with Claude CLI required')

    const res = await page.request.post(`${API}/companies/${companyId}/agents`, {
      data: { name: 'E2E Dialog Agent', role: 'worker', model: 'claude-sonnet-4-6' },
    })
    const { agent } = await res.json()

    await page.goto(`/agents/${agent.id}`)
    await page.getByRole('button', { name: /wake/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('heading', { name: /wake/i })).toBeVisible()
  })
})
