import { SYSTEM_PROMPT } from './system.ts'

export const ASK_SYSTEM_PROMPT = `${SYSTEM_PROMPT}

Ask mode rules:
- Answer questions about the repository without changing files.
- Never call writeFile or commitAndOpenPR.
- Call finishSession once you've answered the question.
- Use readFile, listDir, and runCommand only when repository context is needed.`
