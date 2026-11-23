import { test, expect } from '../../fixtures.ts'
import { PROMPT_PREFIX } from '../../helpers/env.ts'
import {
  createSessionViaHome,
  sidebarSessionButton,
  SESSION_URL_PATTERN,
} from '../../helpers/ui.ts'

const ASK_INSTRUCTION = 'explain what this repository does'

test('creating a session from the home composer opens it, lists it in the sidebar, and reopens its prompt', async ({
  page,
  runId,
}) => {
  const prompt = `${PROMPT_PREFIX} ${runId} ${ASK_INSTRUCTION}`
  const transcript = page.getByRole('main')

  await test.step('the home composer offers the repository and ask mode', async () => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Repository' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ask', exact: true })).toBeVisible()
  })

  await test.step('the user submits a question about the repository', async () => {
    await createSessionViaHome(page, { prompt, mode: 'ASK' })
  })

  await test.step('the new session opens with the question in its transcript', async () => {
    await expect(transcript.getByText(prompt)).toBeVisible()
    await expect(page).toHaveURL(SESSION_URL_PATTERN)
  })

  await test.step('the session appears in the sidebar on the home page', async () => {
    await page.goto('/')
    await expect(sidebarSessionButton(page, prompt)).toBeVisible()
  })

  await test.step('clicking the sidebar entry reopens the same session', async () => {
    await sidebarSessionButton(page, prompt).click()
    await expect(page).toHaveURL(SESSION_URL_PATTERN)
    await expect(transcript.getByText(prompt)).toBeVisible()
  })
})
