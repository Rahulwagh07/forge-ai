import { expect, type Locator, type Page } from '@playwright/test'
import {
  ASK_SESSION_TIMEOUT_MS,
  README_HEADING,
  SESSION_TIMEOUT_MS,
  TEST_REPO_FULL_NAME,
} from './env.ts'

type SessionMode = 'ASK' | 'AGENT'

const MODE_LABEL: Record<SessionMode, string> = {
  ASK: 'Ask',
  AGENT: 'Agent',
}

const PLACEHOLDER: Record<SessionMode, string> = {
  ASK: 'Ask Forge questions about your code',
  AGENT: 'Ask an agent to do the work for you',
}

const STREAM_URL_PATTERN = /\/api\/sessions\/[^/]+\/stream$/
const STREAM_START_TIMEOUT_MS = 30_000

export const SESSION_URL_PATTERN = /\/sessions\/[A-Za-z0-9]+$/

export async function createSessionViaHome(
  page: Page,
  input: { prompt: string; mode: SessionMode; baseBranch?: string },
): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: MODE_LABEL[input.mode], exact: true }).click()
  await page.getByRole('button', { name: 'Repository' }).click()
  await page.getByRole('menuitem').filter({ hasText: TEST_REPO_FULL_NAME }).click()
  if (input.baseBranch) {
    await page.locator('button[aria-label="Base branch"]').click()
    await page.getByRole('option', { name: input.baseBranch, exact: true }).click()
  }

  const liveUpdatesOpened = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      STREAM_URL_PATTERN.test(new URL(response.url()).pathname) &&
      response.ok(),
    { timeout: STREAM_START_TIMEOUT_MS },
  )

  await page.getByPlaceholder(PLACEHOLDER[input.mode]).fill(input.prompt)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page).toHaveURL(SESSION_URL_PATTERN)
  await liveUpdatesOpened
}

export async function expectForgeWaiting(page: Page, mode: SessionMode): Promise<void> {
  const timeout = mode === 'ASK' ? ASK_SESSION_TIMEOUT_MS : SESSION_TIMEOUT_MS
  await expect(page.getByText(/Forge is waiting on you/)).toBeVisible({ timeout })
}

export function sidebarSessionButton(page: Page, prompt: string): Locator {
  return page.locator('[data-sidebar="sidebar"]').getByRole('button').filter({ hasText: prompt })
}

export function readmeHeadingPattern(): RegExp {
  return new RegExp(README_HEADING.replaceAll('-', '[\\s-]*'), 'i')
}
