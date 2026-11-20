import { test, expect } from '../../fixtures.ts'
import { PROMPT_PREFIX, SESSION_TIMEOUT_MS } from '../../helpers/env.ts'
import { createSessionViaHome, SESSION_URL_PATTERN } from '../../helpers/ui.ts'

const CONTENT_MARKER_PREFIX = 'forge-e2e'

test('agent mode writes the requested file, replies in the transcript, and leaves the change in the changes panel', async ({
  page,
  worker,
  runId,
}) => {
  const fileName = `E2E_AGENT_${runId.replaceAll('-', '_')}.md`
  const fileContent = `${CONTENT_MARKER_PREFIX}-${runId}`
  const prompt = `${PROMPT_PREFIX} ${runId} Create a file at the repository root named ${fileName} whose entire content is exactly: ${fileContent}. Do not modify any other file. Do not commit or open a pull request. Then call finishSession with a one-line summary.`
  const transcript = page.getByRole('main')

  await test.step('the user sends an agent-mode request from the home composer', async () => {
    await createSessionViaHome(page, { prompt, mode: 'AGENT' })
    await worker.start()
  })

  await test.step('the agent finishes its run and waits for the user', async () => {
    await expect(page.getByText(/Forge is waiting on you/)).toBeVisible({
      timeout: SESSION_TIMEOUT_MS,
    })
  })

  await test.step('the transcript shows the request and the agent reply', async () => {
    await page.reload()
    await expect(transcript.getByText(prompt)).toBeVisible()
    await expect(transcript.getByText('Forge', { exact: true }).first()).toBeVisible()
  })

  await test.step('the agent work log shows it wrote the requested file', async () => {
    const workedBlocks = transcript.getByText(/^Worked/)
    const workedCount = await workedBlocks.count()
    for (let index = 0; index < workedCount; index += 1) {
      await workedBlocks.nth(index).click()
    }
    await expect(transcript.getByText(`Writing \`${fileName}\``)).toBeVisible()
  })

  await test.step('the changes panel lists the new file as added', async () => {
    await page.getByRole('tab', { name: /Changes/ }).click()
    const changedFiles = page.getByRole('list', { name: 'Changed files' })
    const changedFile = changedFiles.getByRole('listitem').filter({ hasText: fileName })
    await expect(changedFile).toBeVisible()
    await expect(changedFile).toContainText('Added')
    await expect(page.getByRole('tab', { name: /Changes/ })).toContainText('1')
  })

  await test.step('opening the file shows the content the agent wrote', async () => {
    const changedFile = page
      .getByRole('list', { name: 'Changed files' })
      .getByRole('listitem')
      .filter({ hasText: fileName })
    await changedFile.getByRole('button', { name: fileName, exact: true }).click()
    await expect(page.getByText(fileContent).first()).toBeVisible()
  })

  await test.step('the file change is still listed after reloading the session', async () => {
    await page.reload()
    await page.getByRole('tab', { name: /Changes/ }).click()
    await expect(
      page.getByRole('list', { name: 'Changed files' }).getByRole('listitem').filter({
        hasText: fileName,
      }),
    ).toBeVisible()
    await expect(page).toHaveURL(SESSION_URL_PATTERN)
  })
})
