export interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
}

export type StopReason = 'tool_use' | 'end_turn' | 'max_tokens'

export interface ProviderResponse {
  text?: string
  toolCalls: ToolCall[]
  stopReason: StopReason
}

//normalized conversation message, provider independent
export type AgentMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | {
      role: 'tool_result'
      toolCallId: string
      content: string
      isError?: boolean
    }

export interface LLMProvider {
  runStep(
    messages: AgentMessage[],
    tools: ToolDefinition[]
  ): Promise<ProviderResponse>
}
