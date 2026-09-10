import { NotFound } from '@/components/global/not-found'

export default function SessionNotFound() {
  return (
    <NotFound
      title="Session not found"
      description="This session doesn't exist or may have been deleted."
    />
  )
}
