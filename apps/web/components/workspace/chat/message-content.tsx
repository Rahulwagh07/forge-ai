'use client'

import ReactMarkdown, { type Components } from 'react-markdown'

const components: Components = {
  a: ({ node: _node, children, ...props }) => (
    <a
      {...props}
      target="_blank"
      rel="noreferrer"
      className="text-info underline underline-offset-2 outline-none hover:text-info-hover"
    >
      {children}
    </a>
  ),
  p: ({ children }) => <p className="whitespace-pre-wrap leading-relaxed">{children}</p>,
  pre: ({ children }) => (
    <div className="overflow-hidden rounded-lg bg-code-bg/90 text-left">
      <pre className="overflow-x-auto px-3 py-2.5 text-sm leading-5 text-code-fg">{children}</pre>
    </div>
  ),
  code: ({ className, children }) => {
    const language = className?.match(/language-(\S+)/)?.[1]
    if (language) {
      return (
        <>
          <div className="px-3 py-1.5 text-sm uppercase tracking-wide text-code-muted">
            {language}
          </div>
          <code className="block overflow-x-auto px-3 py-2.5 text-sm leading-5 text-code-fg">
            {children}
          </code>
        </>
      )
    }
    return <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">{children}</code>
  },
}

export function MessageContent({ text }: { text: string }) {
  return (
    <div className="space-y-3 break-words">
      <ReactMarkdown components={components}>{text}</ReactMarkdown>
    </div>
  )
}
