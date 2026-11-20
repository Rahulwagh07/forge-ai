import { test, expect } from '../../fixtures.ts'
import { PROMPT_PREFIX } from '../../helpers/env.ts'
import { createSessionViaHome, expectForgeWaiting, readmeHeadingPattern } from '../../helpers/ui.ts'

const FOLLOW_UP_INSTRUCTION =
  'Follow-up: read README.md again and reply with the project name from its first heading.'
const FIRST_INSTRUCTION = 'Read README.md and reply with the project name from its first heading.'

test('a follow-up question continues the same ask session and keeps the earlier reply above it', async ({
  page,
  worker,
  runId,
}) => {
  const firstPrompt = `${PROMPT_PREFIX} ${runId} ${FIRST_INSTRUCTION}`
  const followUp = `${PROMPT_PREFIX} ${runId} ${FOLLOW_UP_INSTRUCTION}`
  const transcript = page.getByRole('main')

  await test.step('the user asks the first question and the agent answers', async () => {
    await createSessionViaHome(page, { prompt: firstPrompt, mode: 'ASK' })
    await worker.start()
    await expectForgeWaiting(page, 'ASK')
  })

  await test.step('the user sends a follow-up question in the same session', async () => {
    await page.getByPlaceholder('Ask a question').fill(followUp)
    await transcript.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(transcript.getByText(followUp)).toBeVisible()
  })

  await test.step('the agent answers the follow-up and waits again', async () => {
    await expect(page.getByText(/Forge is waiting on you/)).toBeHidden()
    await expectForgeWaiting(page, 'ASK')
  })

  await test.step('after reload, both questions and both replies remain in the same transcript', async () => {
    await page.reload()
    await expect(transcript.getByText(firstPrompt)).toBeVisible()
    await expect(transcript.getByText(followUp)).toBeVisible()
    await expect(transcript.getByText(readmeHeadingPattern()).first()).toBeVisible()
  })
})
