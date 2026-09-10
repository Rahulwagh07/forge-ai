import { HugeiconsIcon } from '@hugeicons/react'
import { Loading03Icon } from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'

export function Loader({
  size = 20,
  label = 'Loading',
  className,
  ...props
}: React.ComponentProps<'span'> & { size?: number; label?: string }) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn('inline-flex items-center justify-center text-muted-foreground', className)}
      {...props}
    >
      <HugeiconsIcon icon={Loading03Icon} size={size} className="animate-spin" />
    </span>
  )
}
