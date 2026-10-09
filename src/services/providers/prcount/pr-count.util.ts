import { GitProvider } from '@/globals/enums'

export type PRCounts = {
  total: number
  open: number
  merged: number
  declined: number
}

/* ---------- GitHub: search API se count ---------- */
async function githubCount(token: string, query: string): Promise<number> {
  const res = await fetch(
    `https://api.github.com/search/issues?q=${encodeURIComponent(query)}&per_page=1`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'ai-pr-analyzer',
      },
    }
  )
  if (!res.ok) throw new Error(`GitHub count failed: ${res.status}`)
  const json: any = await res.json()
  return json.total_count ?? 0
}

async function getGithubCounts(token: string, fullName: string): Promise<PRCounts> {
  const base = `repo:${fullName} type:pr`
  const [total, open, merged] = await Promise.all([
    githubCount(token, base),
    githubCount(token, `${base} is:open`),
    githubCount(token, `${base} is:merged`),
  ])
  return { total, open, merged, declined: Math.max(total - open - merged, 0) }
}

/* ---------- GitLab: X-Total header se count ---------- */
async function gitlabCount(token: string, fullName: string, state: string): Promise<number> {
  const res = await fetch(
    `https://gitlab.com/api/v4/projects/${encodeURIComponent(fullName)}/merge_requests?state=${state}&per_page=1`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) throw new Error(`GitLab count failed: ${res.status}`)
  const header = res.headers.get('x-total')
  if (header) return parseInt(header, 10)
//   const list: any[] = await res.json()
  const list = (await res.json()) as any[]
  return list.length
}

async function getGitlabCounts(token: string, fullName: string): Promise<PRCounts> {
  const [open, merged, declined] = await Promise.all([
    gitlabCount(token, fullName, 'opened'),
    gitlabCount(token, fullName, 'merged'),
    gitlabCount(token, fullName, 'closed'),
  ])
  return { total: open + merged + declined, open, merged, declined }
}

/* ---------- Bitbucket: response ke "size" field se count ---------- */
async function bitbucketCount(token: string, fullName: string, state: string): Promise<number> {
  const res = await fetch(
    `https://api.bitbucket.org/2.0/repositories/${fullName}/pullrequests?state=${state}&pagelen=1`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) throw new Error(`Bitbucket count failed: ${res.status}`)
  const json: any = await res.json()
  return json.size ?? 0
}

async function getBitbucketCounts(token: string, fullName: string): Promise<PRCounts> {
  const [open, merged, declined] = await Promise.all([
    bitbucketCount(token, fullName, 'OPEN'),
    bitbucketCount(token, fullName, 'MERGED'),
    bitbucketCount(token, fullName, 'DECLINED'),
  ])
  return { total: open + merged + declined, open, merged, declined }
}

/* ---------- Entry point ---------- */
export async function getProviderPRCounts(
  provider: GitProvider,
  accessToken: string,
  fullName: string
): Promise<PRCounts | null> {
  switch (provider) {
    case GitProvider.GITHUB:
      return getGithubCounts(accessToken, fullName)
    case GitProvider.GITLAB:
      return getGitlabCounts(accessToken, fullName)
    case GitProvider.BITBUCKET:
      return getBitbucketCounts(accessToken, fullName)
    default:
      return null // azure / codecommit abhi supported nahi
  }
}