import { test, expect } from '../../fixtures.ts'
import { BASE_URL, PROMPT_PREFIX } from '../../helpers/env.ts'
import { createSessionViaHome } from '../../helpers/ui.ts'

test('deleting a session from its sidebar menu removes it from the list and stays removed after reload', async ({
  page,
  runId,
}) => {
  const prompt = `${PROMPT_PREFIX} ${runId} session to delete`
  const sidebar = page.locator('[data-sidebar="sidebar"]')
  const row = sidebar.getByRole('listitem').filter({ hasText: prompt })

  await test.step('the user creates a session that they later delete', async () => {
    await createSessionViaHome(page, { prompt, mode: 'ASK' })
  })

  await test.step('the session is open and listed in the sidebar', async () => {
    await expect(row).toBeVisible()
  })

  await test.step('the user opens the row menu and chooses Delete', async () => {
    await row.hover()
    await row.getByTitle('More options').click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
  })

  await test.step('the app returns to the home page without the session', async () => {
    await expect(page).toHaveURL(`${BASE_URL}/`)
    await expect(sidebar.getByText(prompt)).toHaveCount(0)
  })

  await test.step('after reload, the session is still gone', async () => {
    await page.reload()
    await expect(sidebar.getByText(prompt)).toHaveCount(0)
  })
})
