export { fetchBaseAndStageUntracked, runInRepo } from './exec.ts'
export { ensureBaseBranch, type BaseBranchState } from './base.ts'
export {
  getChangeStats,
  getFileContents,
  getSessionDiffSnapshot,
  MAX_FILE_CONTENT_BYTES,
  type FileContentResult,
  type SessionDiffFileRecord,
  type SessionDiffSnapshot,
  type SessionDiffTotals,
  type StepFileStatus,
} from './diff.ts'
