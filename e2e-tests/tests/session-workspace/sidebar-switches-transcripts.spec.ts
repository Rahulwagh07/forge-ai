import { test, expect } from '../../fixtures.ts'
import { PROMPT_PREFIX } from '../../helpers/env.ts'
import {
  createSessionViaHome,
  sidebarSessionButton,
  SESSION_URL_PATTERN,
} from '../../helpers/ui.ts'

test('selecting a session in the sidebar shows only that session transcript', async ({
  page,
  runId,
}) => {
  const firstPrompt = `${PROMPT_PREFIX} ${runId} first transcript question`
  const secondPrompt = `${PROMPT_PREFIX} ${runId} second transcript question`
  const transcript = page.getByRole('main')

  await test.step('the user creates two sessions with different questions', async () => {
    await createSessionViaHome(page, { prompt: firstPrompt, mode: 'ASK' })
    await createSessionViaHome(page, { prompt: secondPrompt, mode: 'ASK' })
  })

  await test.step('the sidebar lists both sessions', async () => {
    await expect(sidebarSessionButton(page, firstPrompt)).toBeVisible()
    await expect(sidebarSessionButton(page, secondPrompt)).toBeVisible()
  })

  await test.step('opening the first session shows only its own question', async () => {
    await sidebarSessionButton(page, firstPrompt).click()
    await expect(page).toHaveURL(SESSION_URL_PATTERN)
    await expect(transcript.getByText(firstPrompt)).toBeVisible()
    await expect(transcript.getByText(secondPrompt)).toHaveCount(0)
  })

  await test.step('opening the second session swaps the transcript to its question', async () => {
    await sidebarSessionButton(page, secondPrompt).click()
    await expect(transcript.getByText(secondPrompt)).toBeVisible()
    await expect(transcript.getByText(firstPrompt)).toHaveCount(0)
  })

  await test.step('opening the first session again restores its transcript', async () => {
    await sidebarSessionButton(page, firstPrompt).click()
    await expect(transcript.getByText(firstPrompt)).toBeVisible()
    await expect(transcript.getByText(secondPrompt)).toHaveCount(0)
  })
})
