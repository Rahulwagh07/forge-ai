import { test, expect } from '../../fixtures.ts'
import { PROMPT_PREFIX } from '../../helpers/env.ts'
import { createSessionViaHome } from '../../helpers/ui.ts'

test('a signed-out visitor opening a session link is sent to the landing page and can open the login dialog', async ({
  page,
  browser,
  runId,
}) => {
  const prompt = `${PROMPT_PREFIX} ${runId} private session for the signed-out check`
  let sessionLink = ''

  await test.step('a signed-in user creates a private session and copies its link', async () => {
    await createSessionViaHome(page, { prompt, mode: 'ASK' })
    sessionLink = page.url()
  })

  const visitorContext = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  })
  try {
    const visitor = await visitorContext.newPage()

    await test.step('a signed-out visitor opens that link', async () => {
      await visitor.goto(sessionLink)
    })

    await test.step('the visitor is redirected to the landing page without seeing the session', async () => {
      await expect(visitor).toHaveURL(new URL('/', sessionLink).toString())
      await expect(visitor.getByText(prompt)).toHaveCount(0)
    })

    await test.step('the visitor opens the login dialog from the landing page', async () => {
      await visitor.getByRole('button', { name: 'Login' }).click()
      await expect(visitor.getByRole('dialog')).toContainText('Log in to Forge')
    })
  } finally {
    await visitorContext.close()
  }
})
