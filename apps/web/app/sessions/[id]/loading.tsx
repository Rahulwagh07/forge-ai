import { Loader } from '@/components/global/loader'

export default function Loading() {
  return (
    <main className="flex h-full min-h-0 w-full flex-1 items-center justify-center pl-3 md:pl-4 xl:pl-6">
      <Loader size={28} />
    </main>
  )
}
