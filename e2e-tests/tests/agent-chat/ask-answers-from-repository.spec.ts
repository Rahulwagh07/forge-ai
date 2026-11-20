import { test, expect } from '../../fixtures.ts'
import { PROMPT_PREFIX } from '../../helpers/env.ts'
import {
  createSessionViaHome,
  expectForgeWaiting,
  readmeHeadingPattern,
  SESSION_URL_PATTERN,
} from '../../helpers/ui.ts'

const ASK_INSTRUCTION =
  'Read README.md and reply with the project name from its first heading. Do not inspect any other file.'

test('ask mode reads the readme, replies with the project name, and leaves the repository untouched', async ({
  page,
  worker,
  runId,
}) => {
  const prompt = `${PROMPT_PREFIX} ${runId} ${ASK_INSTRUCTION}`
  const transcript = page.getByRole('main')

  await test.step('the user asks a question from the home composer', async () => {
    await createSessionViaHome(page, { prompt, mode: 'ASK' })
    await worker.start()
  })

  await test.step('the agent answers and waits for the next question', async () => {
    await expectForgeWaiting(page, 'ASK')
  })

  await test.step('the transcript shows the question and the project name from the readme', async () => {
    await page.reload()
    await expect(transcript.getByText(prompt)).toBeVisible()
    await expect(transcript.getByText(readmeHeadingPattern()).first()).toBeVisible()
  })

  await test.step('the work log shows the agent read README.md', async () => {
    await transcript
      .getByText(/^Worked/)
      .first()
      .click()
    await expect(transcript.getByText(/Reading .*README\.md/i).first()).toBeVisible()
  })

  await test.step('ask mode shows no changes panel because nothing was edited', async () => {
    await expect(page.getByRole('tab', { name: /Changes/ })).toHaveCount(0)
    await expect(page).toHaveURL(SESSION_URL_PATTERN)
  })
})
