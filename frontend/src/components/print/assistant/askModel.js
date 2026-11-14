import { getEnv } from '@/environment.js'
import systemPrompt from './systemPrompt.md?raw'
import { tools } from './tools.js'

const MAX_TOKENS = 64000

export class AssistantUnavailableError extends Error {}

/**
 * Sends one round of the conversation to the model.
 *
 * @param messages conversation in the wire format of the Messages API
 * @returns the assistant message in the wire format of the Messages API
 */
export async function askModel(messages) {
  const { ANTHROPIC_API_KEY: apiKey, PRINT_ASSISTANT_MODEL: model } = getEnv()
  if (!apiKey) throw new AssistantUnavailableError()

  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

  return client.beta.messages
    .stream({
      model,
      max_tokens: MAX_TOKENS,
      system: [{ type: 'text', text: systemPrompt }],
      tools,
      messages,
      output_config: { effort: 'high' },
      cache_control: { type: 'ephemeral' },
      fallbacks: 'default',
      betas: ['server-side-fallback-2026-07-01'],
    })
    .finalMessage()
}
