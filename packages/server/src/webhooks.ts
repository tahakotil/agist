import { createHmac } from 'crypto'
import { all } from './db.js'
import { logger } from './logger.js'

interface WebhookRow {
  id: string
  company_id: string
  url: string
  events: string
  secret: string | null
  enabled: number
  created_at: string
  updated_at: string
}

/**
 * Fire-and-forget webhook dispatch.
 * Delivers the event payload to all enabled webhooks subscribed to the given event.
 * Never throws — errors are logged and swallowed.
 */
export async function dispatchWebhooks(
  companyId: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  let rows: WebhookRow[]
  try {
    rows = all<WebhookRow>(
      `SELECT * FROM webhooks WHERE company_id = ? AND enabled = 1`,
      [companyId]
    )
  } catch (err) {
    logger.warn('dispatchWebhooks: failed to query webhooks table', {
      companyId,
      event,
      error: (err as Error).message,
    })
    return
  }

  for (const webhook of rows) {
    const subscribedEvents = webhook.events === '*'
      ? ['*']
      : webhook.events.split(',').map((e) => e.trim()).filter(Boolean)

    if (!subscribedEvents.includes('*') && !subscribedEvents.includes(event)) {
      continue
    }

    const body = JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      data: payload,
    })

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }

    if (webhook.secret) {
      const signature = createHmac('sha256', webhook.secret).update(body).digest('hex')
      headers['X-Agist-Signature'] = `sha256=${signature}`
    }

    // Fire-and-forget — do NOT await
    fetch(webhook.url, { method: 'POST', headers, body }).catch((err: unknown) => {
      logger.warn('Webhook delivery failed', {
        webhookId: webhook.id,
        url: webhook.url,
        event,
        error: (err as Error).message,
      })
    })
  }
}
