import { signIn } from '@/auth'
import { Button } from '@/components/ui/button'
import { GoogleMark } from '@/components/workspace/home/google-mark'

export function SignIn() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="flex w-full max-w-xl flex-col items-center text-center">
        <h1 className="text-4xl font-medium tracking-tight text-foreground sm:text-5xl">
          Remember Forge?
        </h1>
        <p className="mt-2 text-2xl tracking-tight text-muted-foreground sm:text-3xl">
          It&apos;s actually good now
        </p>
        <form
          action={async () => {
            'use server'
            await signIn('google')
          }}
          className="mt-10 w-full max-w-xs"
        >
          <Button
            type="submit"
            className="h-10 w-full justify-center bg-white !text-black hover:bg-white/90 dark:bg-white dark:!text-black"
          >
            <GoogleMark />
            Sign in with Google
          </Button>
        </form>
      </div>
    </main>
  )
}
