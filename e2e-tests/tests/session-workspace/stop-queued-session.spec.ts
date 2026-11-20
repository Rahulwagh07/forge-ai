import { test, expect } from '../../fixtures.ts'
import { PROMPT_PREFIX } from '../../helpers/env.ts'
import { createSessionViaHome, expectForgeWaiting, SESSION_URL_PATTERN } from '../../helpers/ui.ts'

test('stopping a queued session from the composer ends the run and keeps the transcript after reload', async ({
  page,
  runId,
}) => {
  const prompt = `${PROMPT_PREFIX} ${runId} queued session to stop`
  const transcript = page.getByRole('main')

  await test.step('the user submits a question that is still queued', async () => {
    await createSessionViaHome(page, { prompt, mode: 'ASK' })
  })

  await test.step('the user presses Stop in the composer', async () => {
    await transcript.getByRole('button', { name: 'Stop', exact: true }).click()
  })

  await test.step('the session waits for input and the composer switches back to Send', async () => {
    await expectForgeWaiting(page, 'ASK')
    await expect(transcript.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0)
  })

  await test.step('after reload, the transcript and waiting state are unchanged', async () => {
    await page.reload()
    await expect(transcript.getByText(prompt)).toBeVisible()
    await expectForgeWaiting(page, 'ASK')
    await expect(transcript.getByRole('button', { name: 'Send', exact: true })).toBeVisible()
    await expect(page).toHaveURL(SESSION_URL_PATTERN)
  })
})
