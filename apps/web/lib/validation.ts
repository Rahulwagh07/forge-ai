import { NextResponse } from 'next/server'
import type { ZodError, ZodType } from 'zod'

export type ParseResult<T> = { data: T } | { error: NextResponse }

function issueResponse(error: ZodError): NextResponse {
  const issues = error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }))
  return NextResponse.json({ error: 'Validation failed', issues }, { status: 400 })
}

function parse<T>(value: unknown, schema: ZodType<T>): ParseResult<T> {
  const result = schema.safeParse(value)
  if (!result.success) return { error: issueResponse(result.error) }
  return { data: result.data }
}

export function parseValue<T>(value: unknown, schema: ZodType<T>): ParseResult<T> {
  return parse(value, schema)
}

export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<ParseResult<T>> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return { error: NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  }
  return parse(raw, schema)
}

export function parseQuery<T>(url: string | URL, schema: ZodType<T>): ParseResult<T> {
  const searchParams = new URL(url.toString()).searchParams
  return parse(Object.fromEntries(searchParams), schema)
}

export function parseParams<T>(params: Record<string, string>, schema: ZodType<T>): ParseResult<T> {
  return parse(params, schema)
}
