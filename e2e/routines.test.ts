import { test, expect } from '@playwright/test'

const API = 'http://localhost:4400/api'

async function createCompanyAndAgent(request: { post: (url: string, opts: { data: unknown }) => Promise<{ json: () => Promise<unknown> }> }) {
  const compRes = await request.post(`${API}/companies`, {
    data: { name: `E2E Routines Co ${Date.now()}` },
  })
  const { company } = (await compRes.json()) as { company: { id: string } }

  const agentRes = await request.post(`${API}/companies/${company.id}/agents`, {
    data: { name: 'E2E Routine Agent', role: 'worker', model: 'claude-sonnet-4-6' },
  })
  const { agent } = (await agentRes.json()) as { agent: { id: string } }

  return { companyId: company.id, agentId: agent.id }
}

async function cleanup(companyId: string) {
  await fetch(`${API}/companies/${companyId}`, { method: 'DELETE' })
}

test.describe('Routines', () => {
  let companyId: string
  let agentId: string
  let routineId: string

  test.beforeEach(async ({ request }) => {
    const result = await createCompanyAndAgent(request as Parameters<typeof createCompanyAndAgent>[0])
    companyId = result.companyId
    agentId = result.agentId

    // Create a routine via API
    const routRes = await request.post(`${API}/companies/${companyId}/routines`, {
      data: {
        agentId,
        title: 'E2E Test Routine',
        cronExpression: '0 * * * *',
        timezone: 'UTC',
      },
    })
    const { routine } = (await routRes.json()) as { routine: { id: string } }
    routineId = routine.id
  })

  test.afterEach(async () => {
    if (companyId) {
      await cleanup(companyId)
    }
  })

  test('routines page loads with heading', async ({ page }) => {
    await page.goto('/routines')
    await expect(page.getByRole('heading', { name: 'Routines' })).toBeVisible()
  })

  test('created routine appears on routines page', async ({ page }) => {
    await page.goto('/routines')
    await expect(page.getByText('E2E Test Routine')).toBeVisible({ timeout: 10000 })
  })

  test('routine shows cron expression', async ({ page }) => {
    await page.goto('/routines')
    await expect(page.getByText('0 * * * *')).toBeVisible({ timeout: 10000 })
  })

  test('routine shows Active/Paused badge', async ({ page }) => {
    await page.goto('/routines')
    // Should have Active badge since routine is enabled by default
    await expect(page.getByText('Active').first()).toBeVisible({ timeout: 10000 })
  })

  test('toggle routine enable/disable', async ({ page }) => {
    await page.goto('/routines')

    // Wait for routine to appear
    await expect(page.getByText('E2E Test Routine')).toBeVisible({ timeout: 10000 })

    // Find the Pause button and click it
    const pauseButton = page.getByRole('button', { name: /pause/i }).first()
    await expect(pauseButton).toBeVisible()
    await pauseButton.click()

    // Should now show "Paused" badge
    await expect(page.getByText('Paused').first()).toBeVisible({ timeout: 5000 })

    // Enable it again
    const enableButton = page.getByRole('button', { name: /enable/i }).first()
    await expect(enableButton).toBeVisible()
    await enableButton.click()

    // Should show Active again
    await expect(page.getByText('Active').first()).toBeVisible({ timeout: 5000 })
  })

  test('routine appears in company detail page', async ({ page }) => {
    await page.goto(`/companies/${companyId}`)
    await expect(page.getByText('Routines')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('E2E Test Routine')).toBeVisible({ timeout: 10000 })
  })
})
