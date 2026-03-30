import { logger } from '../logger.js'

function formatSlackMessage(event: string, data: Record<string, unknown>): string {
  const agent = data.agent as Record<string, unknown> | undefined
  const run = data.run as Record<string, unknown> | undefined
  const agentName = (agent?.name as string) ?? 'Unknown agent'

  switch (event) {
    case 'run.completed': {
      const costDollars = (((run?.costCents as number) ?? 0) / 100).toFixed(4)
      const durationMs = (run?.durationMs as number) ?? 0
      const model = (run?.model as string) ?? 'unknown'
      return `:white_check_mark: *${agentName}* completed a run\nModel: ${model} | Cost: $${costDollars} | Duration: ${durationMs}ms`
    }
    case 'run.failed': {
      const errorMsg = (data.error as string) ?? 'Unknown error'
      return `:x: *${agentName}* run failed\nError: ${errorMsg}`
    }
    case 'agent.status': {
      const status = (agent?.status as string) ?? 'unknown'
      return `:information_source: *${agentName}* status changed to \`${status}\``
    }
    default:
      return `Agist event: \`${event}\``
  }
}

/**
 * Send a Slack notification via an Incoming Webhook URL.
 * Reads SLACK_WEBHOOK_URL from env if webhookUrl is not provided.
 */
export async function sendSlackNotification(
  event: string,
  data: Record<string, unknown>,
  webhookUrl?: string
): Promise<void> {
  const url = webhookUrl ?? process.env.SLACK_WEBHOOK_URL
  if (!url) return

  const text = formatSlackMessage(event, data)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (!response.ok) {
      logger.warn('Slack notification failed', { status: response.status, event })
    }
  } catch (err) {
    logger.warn('Slack notification error', { error: (err as Error).message, event })
  }
}
