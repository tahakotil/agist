import { logger } from '../logger.js'

/**
 * Create a GitHub issue for agent failures.
 * Only fires for 'run.failed' and 'agent.error' events.
 *
 * Reads GITHUB_TOKEN and GITHUB_REPO from env if not provided.
 * GITHUB_REPO format: "owner/repo"
 */
export async function createGitHubIssue(
  event: string,
  data: Record<string, unknown>,
  token?: string,
  repo?: string
): Promise<void> {
  // Only create issues for failure events
  if (event !== 'run.failed' && event !== 'agent.error') return

  const githubToken = token ?? process.env.GITHUB_TOKEN
  const githubRepo = repo ?? process.env.GITHUB_REPO

  if (!githubToken || !githubRepo) return

  const parts = githubRepo.split('/')
  if (parts.length !== 2) {
    logger.warn('GITHUB_REPO must be in "owner/repo" format', { repo: githubRepo })
    return
  }

  const [owner, repoName] = parts
  const agent = data.agent as Record<string, unknown> | undefined
  const run = data.run as Record<string, unknown> | undefined
  const agentName = (agent?.name as string) ?? 'Unknown agent'
  const errorMsg = (data.error as string) ?? 'Unknown error'
  const runId = (run?.id as string) ?? 'n/a'

  const issueBody = [
    `**Event:** \`${event}\``,
    `**Agent:** ${agentName}`,
    `**Error:** ${errorMsg}`,
    `**Run ID:** \`${runId}\``,
    `**Timestamp:** ${new Date().toISOString()}`,
  ].join('\n')

  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repoName}/issues`,
      {
        method: 'POST',
        headers: {
          'Authorization': `token ${githubToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github.v3+json',
        },
        body: JSON.stringify({
          title: `[Agist] Agent "${agentName}" failed`,
          body: issueBody,
          labels: ['agist', 'agent-failure'],
        }),
      }
    )

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      logger.warn('GitHub issue creation failed', {
        status: response.status,
        event,
        repo: githubRepo,
        body: text,
      })
    }
  } catch (err) {
    logger.warn('GitHub issue creation error', { error: (err as Error).message, event })
  }
}
