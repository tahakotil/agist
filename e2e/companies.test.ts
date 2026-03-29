import { test, expect } from '@playwright/test'

const API = 'http://localhost:4400/api'

async function cleanupCompany(name: string) {
  const res = await fetch(`${API}/companies`)
  const data = await res.json()
  const company = data.companies?.find((c: { name: string; id: string }) => c.name === name)
  if (company) {
    await fetch(`${API}/companies/${company.id}`, { method: 'DELETE' })
  }
}

test.describe('Companies CRUD', () => {
  const testCompanyName = `E2E Test Company ${Date.now()}`

  test.afterEach(async () => {
    await cleanupCompany(testCompanyName)
  })

  test('companies page loads with heading', async ({ page }) => {
    await page.goto('/companies')
    await expect(page.getByRole('heading', { name: 'Companies' })).toBeVisible()
  })

  test('shows empty state or company list', async ({ page }) => {
    await page.goto('/companies')
    // Either there are companies or there's the empty state
    const hasCompanies = await page.locator('[class*="grid"]').count() > 0
    const hasEmptyState = await page.getByText('No companies yet.').isVisible().catch(() => false)
    const hasNewCompanyButton = await page.getByRole('button', { name: /new company/i }).isVisible()
    expect(hasCompanies || hasEmptyState || hasNewCompanyButton).toBeTruthy()
  })

  test('create company via UI', async ({ page }) => {
    await page.goto('/companies')

    // Click "New Company" button
    await page.getByRole('button', { name: /new company/i }).click()

    // Dialog should open
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'New Company' })).toBeVisible()

    // Fill in name
    await page.getByPlaceholder('Acme Corp').fill(testCompanyName)

    // Fill in description
    await page.getByPlaceholder('Optional description...').fill('A test company created by E2E tests')

    // Submit
    await page.getByRole('button', { name: 'Create Company' }).click()

    // Dialog should close
    await expect(page.getByRole('dialog')).not.toBeVisible()

    // Company should appear in list
    await expect(page.getByText(testCompanyName)).toBeVisible()
  })

  test('click company card navigates to detail page', async ({ page }) => {
    // Create company via API first
    const res = await page.request.post(`${API}/companies`, {
      data: { name: testCompanyName, description: 'For detail page test' },
    })
    const { company } = await res.json()

    await page.goto('/companies')
    await expect(page.getByText(testCompanyName)).toBeVisible()

    // Click the company card (it's wrapped in a Link)
    await page.getByText(testCompanyName).click()
    await expect(page).toHaveURL(`/companies/${company.id}`)

    // Detail page has the company name as heading
    await expect(page.getByRole('heading', { name: testCompanyName })).toBeVisible()
  })

  test('company detail page shows org chart section', async ({ page }) => {
    const res = await page.request.post(`${API}/companies`, {
      data: { name: testCompanyName },
    })
    const { company } = await res.json()

    await page.goto(`/companies/${company.id}`)
    await expect(page.getByText('Organization Chart')).toBeVisible()
  })

  test('company detail shows back button', async ({ page }) => {
    const res = await page.request.post(`${API}/companies`, {
      data: { name: testCompanyName },
    })
    const { company } = await res.json()

    await page.goto(`/companies/${company.id}`)
    await expect(page.getByRole('link', { name: /companies/i }).first()).toBeVisible()
  })
})
