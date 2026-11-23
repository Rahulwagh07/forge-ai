import { test, expect } from '../../fixtures.ts'
import { BASE_URL, MAX_PROMPT_LENGTH, PROMPT_PREFIX } from '../../helpers/env.ts'

const COMPOSER_PLACEHOLDER = 'Ask Forge questions about your code'
const VALIDATION_MESSAGE = 'Validation failed'

test('the home composer keeps send disabled for blank input and rejects an oversized prompt without saving it', async ({
  page,
  runId,
}) => {
  const send = page.getByRole('button', { name: 'Send', exact: true })
  const input = page.getByPlaceholder(COMPOSER_PLACEHOLDER)
  const marker = `${PROMPT_PREFIX} ${runId} oversized prompt`
  const oversizedPrompt = `${marker} ${'x'.repeat(MAX_PROMPT_LENGTH)}`
  let alertMessage = ''

  await test.step('the user opens the home composer', async () => {
    await page.goto('/')
    await expect(send).toBeDisabled()
  })

  await test.step('whitespace-only input keeps Send disabled', async () => {
    await input.fill('     ')
    await expect(send).toBeDisabled()
  })

  await test.step('the user submits a prompt over the length limit', async () => {
    page.once('dialog', async (dialog) => {
      alertMessage = dialog.message()
      await dialog.accept()
    })
    await input.fill(oversizedPrompt)
    await expect(send).toBeEnabled()
    await send.click()
  })

  await test.step('the app reports the validation failure and stays on the home page', async () => {
    await expect.poll(() => alertMessage).toContain(VALIDATION_MESSAGE)
    await expect(page).toHaveURL(`${BASE_URL}/`)
  })

  await test.step('after reload, no session was saved for the rejected prompt', async () => {
    await page.reload()
    const sidebar = page.locator('[data-sidebar="sidebar"]')
    await expect(sidebar.getByText(marker)).toHaveCount(0)
  })
})
