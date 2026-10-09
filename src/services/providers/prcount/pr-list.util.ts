import { GitProvider } from '@/globals/enums'

export type ProviderPR = {
  number: number
  title: string
  author: string
  avatar: string | null
  status: 'open' | 'merged' | 'declined'
  url: string
}

export type ProviderPRPage = { items: ProviderPR[]; total: number }

/* ---------- GitHub: search API (items + total_count ek hi call me) ---------- */
async function listGithub(token: string, fullName: string, page: number, limit: number): Promise<ProviderPRPage> {
  const q = encodeURIComponent(`repo:${fullName} type:pr`)
  const res = await fetch(
    `https://api.github.com/search/issues?q=${q}&sort=created&order=desc&per_page=${limit}&page=${page}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'ai-pr-analyzer',
      },
    }
  )
  if (!res.ok) throw new Error(`GitHub list failed: ${res.status}`)
  const json: any = await res.json()

  return {
    total: json.total_count ?? 0,
    items: (json.items ?? []).map((i: any) => ({
      number: i.number,
      title: i.title,
      author: i.user?.login ?? 'Unknown',
      avatar: i.user?.avatar_url ?? null,
      status: i.pull_request?.merged_at ? 'merged' : i.state === 'open' ? 'open' : 'declined',
      url: i.html_url,
    })),
  }
}

/* ---------- GitLab: X-Total header se total ---------- */
async function listGitlab(token: string, fullName: string, page: number, limit: number): Promise<ProviderPRPage> {
  const res = await fetch(
    `https://gitlab.com/api/v4/projects/${encodeURIComponent(fullName)}/merge_requests?state=all&order_by=created_at&sort=desc&per_page=${limit}&page=${page}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) throw new Error(`GitLab list failed: ${res.status}`)
//   const list: any[] = await res.json()
  const list = (await res.json()) as any[]
  const total = parseInt(res.headers.get('x-total') ?? '', 10)

  return {
    total: Number.isNaN(total) ? list.length : total,
    items: list.map((m) => ({
      number: m.iid,
      title: m.title,
      author: m.author?.name ?? m.author?.username ?? 'Unknown',
      avatar: m.author?.avatar_url ?? null,
      status: m.state === 'merged' ? 'merged' : m.state === 'opened' ? 'open' : 'declined',
      url: m.web_url,
    })),
  }
}

/* ---------- Bitbucket: "size" field se total ---------- */
async function listBitbucket(token: string, fullName: string, page: number, limit: number): Promise<ProviderPRPage> {
  const params = new URLSearchParams()
  ;['OPEN', 'MERGED', 'DECLINED'].forEach((s) => params.append('state', s))
  params.set('sort', '-created_on')
  params.set('pagelen', String(limit))
  params.set('page', String(page))

  const res = await fetch(
    `https://api.bitbucket.org/2.0/repositories/${fullName}/pullrequests?${params.toString()}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) throw new Error(`Bitbucket list failed: ${res.status}`)
  const json: any = await res.json()

  return {
    total: json.size ?? 0,
    items: (json.values ?? []).map((p: any) => ({
      number: p.id,
      title: p.title,
      author: p.author?.display_name ?? 'Unknown',
      avatar: p.author?.links?.avatar?.href ?? null,
      status: p.state === 'MERGED' ? 'merged' : p.state === 'OPEN' ? 'open' : 'declined',
      url: p.links?.html?.href ?? '#',
    })),
  }
}

/* ---------- Entry point ---------- */
export async function listProviderPRs(
  provider: GitProvider,
  accessToken: string,
  fullName: string,
  page: number,
  limit: number
): Promise<ProviderPRPage | null> {
  switch (provider) {
    case GitProvider.GITHUB:
      return listGithub(accessToken, fullName, page, limit)
    case GitProvider.GITLAB:
      return listGitlab(accessToken, fullName, page, limit)
    case GitProvider.BITBUCKET:
      return listBitbucket(accessToken, fullName, page, limit)
    default:
      return null // azure / codecommit: DB fallback chalega
  }
}