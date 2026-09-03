import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

export function UserAvatar({
  user,
  size = 8,
}: {
  user?: { name?: string | null; avatarUrl?: string | null } | null
  size?: number
}) {
  return (
    <Avatar className={size === 8 ? 'size-8' : 'size-6'}>
      {user?.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user.name ?? ''} /> : null}
      <AvatarFallback>{(user?.name ?? '?').slice(0, 1).toUpperCase()}</AvatarFallback>
    </Avatar>
  )
}
