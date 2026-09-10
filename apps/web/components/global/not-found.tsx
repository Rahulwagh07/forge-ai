import Link from 'next/link'
import { HugeiconsIcon } from '@hugeicons/react'
import { FileNotFoundIcon } from '@hugeicons/core-free-icons'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function NotFound({
  title = 'Page not found',
  description = "The page you're looking for doesn't exist or has been moved.",
  actionLabel = 'New session',
  actionHref = '/',
}: {
  title?: string
  description?: string
  actionLabel?: string
  actionHref?: string
}) {
  return (
    <main className="flex h-full min-h-0 w-full flex-1 items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-md flex-col items-center text-center">
        <div className="mb-6 flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <HugeiconsIcon icon={FileNotFoundIcon} size={24} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
        <Link href={actionHref} className={cn(buttonVariants({ variant: 'outline' }), 'mt-8')}>
          {actionLabel}
        </Link>
      </div>
    </main>
  )
}
