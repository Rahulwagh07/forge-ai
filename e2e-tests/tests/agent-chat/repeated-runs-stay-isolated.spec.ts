import { test, expect } from '../../fixtures.ts'
import { PROMPT_PREFIX } from '../../helpers/env.ts'
import {
  createSessionViaHome,
  expectForgeWaiting,
  readmeHeadingPattern,
  sidebarSessionButton,
} from '../../helpers/ui.ts'

const ASK_INSTRUCTION = 'Read README.md and reply with the project name from its first heading.'

test('two ask sessions started back to back each answer in their own transcript', async ({
  page,
  worker,
  runId,
}) => {
  const firstPrompt = `${PROMPT_PREFIX} ${runId} First run: ${ASK_INSTRUCTION}`
  const secondPrompt = `${PROMPT_PREFIX} ${runId} Second run: ${ASK_INSTRUCTION}`
  const transcript = page.getByRole('main')

  await test.step('the user starts two ask sessions one after another', async () => {
    await createSessionViaHome(page, { prompt: firstPrompt, mode: 'ASK' })
    await createSessionViaHome(page, { prompt: secondPrompt, mode: 'ASK' })
    await worker.start()
  })

  await test.step('the first session in the sidebar answers only its own question', async () => {
    await sidebarSessionButton(page, firstPrompt).click()
    await expectForgeWaiting(page, 'ASK')
    await expect(transcript.getByText(firstPrompt)).toBeVisible()
    await expect(transcript.getByText(readmeHeadingPattern()).first()).toBeVisible()
    await expect(transcript.getByText(secondPrompt)).toHaveCount(0)
  })

  await test.step('the second session in the sidebar answers only its own question', async () => {
    await sidebarSessionButton(page, secondPrompt).click()
    await expectForgeWaiting(page, 'ASK')
    await expect(transcript.getByText(secondPrompt)).toBeVisible()
    await expect(transcript.getByText(readmeHeadingPattern()).first()).toBeVisible()
    await expect(transcript.getByText(firstPrompt)).toHaveCount(0)
  })

  await test.step('the sidebar lists both sessions', async () => {
    await expect(sidebarSessionButton(page, firstPrompt)).toBeVisible()
    await expect(sidebarSessionButton(page, secondPrompt)).toBeVisible()
  })
})
