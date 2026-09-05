export const COMPACTION_PROMPT = `Summarize this coding session so work can continue with a fresh context. Be concrete: file paths, decisions, what is done vs next.

## Goal
[What the user is trying to accomplish]

## Constraints & Preferences
- [Requirements mentioned by user]

## Progress
### Done
- [x] [Completed tasks]

### In Progress
- [ ] [Current work]

### Blocked
- [Issues, if any]

## Key Decisions
- **[Decision]**: [Rationale]

## Relevant Files
- [Paths read or modified, with one-line note each]

## Next Steps
1. [What should happen next]

## Critical Context
- [Data needed to continue]
`
