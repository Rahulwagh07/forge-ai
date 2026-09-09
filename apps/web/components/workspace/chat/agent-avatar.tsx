'use client'

export function AgentAvatar({ size = 20 }: { size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-[6px] bg-white"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <img
        src="/logo.png"
        alt=""
        width={size}
        height={size}
        className="h-full w-full object-cover"
      />
    </span>
  )
}
