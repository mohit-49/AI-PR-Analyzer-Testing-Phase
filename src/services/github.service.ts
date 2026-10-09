// import axios from 'axios'
// import { IChangedFile } from '../globals/interfaces'
// import { logger } from '../lib/logger'
// import { IGitProviderService, ProviderRepoSummary } from './providers/git-provider.interface'

// const GITHUB_API_BASE = 'https://api.github.com'

// interface GitHubPRData {
//   title: string
//   body: string
//   number: number
//   user: { login: string }
//   base: { ref: string }
//   head: { ref: string }
//   html_url: string
//   id: number
//   merged_at: string | null
//   state: string
// }

// interface GitHubFileData {
//   filename: string
//   status: 'added' | 'modified' | 'deleted' | 'renamed'
//   additions: number
//   deletions: number
//   patch?: string
// }

// export class GitHubService implements IGitProviderService {

//   private getHeaders(accessToken: string): Record<string, string> {
//     return {
//       Authorization: `Bearer ${accessToken}`,
//       Accept: 'application/vnd.github+json',
//       'X-GitHub-Api-Version': '2022-11-28',
//     }
//   }

//   async getPullRequest(
//     accessToken: string,
//     repoFullName: string,
//     prNumber: number
//   ): Promise<GitHubPRData> {
//     const { data } = await axios.get<GitHubPRData>(
//       `${GITHUB_API_BASE}/repos/${repoFullName}/pulls/${prNumber}`,
//       { headers: this.getHeaders(accessToken) }
//     )
//     return data
//   }

//   async mergePullRequest(
//     accessToken: string,
//     repoFullName: string,
//     prNumber: number,
//     mergeMethod: string
//   ): Promise<void> {
//     await axios.put(
//       `${GITHUB_API_BASE}/repos/${repoFullName}/pulls/${prNumber}/merge`,
//       { merge_method: mergeMethod },
//       { headers: this.getHeaders(accessToken) }
//     )
//     logger.info({ repoFullName, prNumber, mergeMethod }, 'GitHub PR merged')
//   }

//   async declinePullRequest(
//     accessToken: string,
//     repoFullName: string,
//     prNumber: number,
//     reason?: string
//   ): Promise<void> {
//     if (reason) {
//       await axios.post(
//         `${GITHUB_API_BASE}/repos/${repoFullName}/issues/${prNumber}/comments`,
//         { body: reason },
//         { headers: this.getHeaders(accessToken) }
//       )
//     }
//     await axios.patch(
//       `${GITHUB_API_BASE}/repos/${repoFullName}/pulls/${prNumber}`,
//       { state: 'closed' },
//       { headers: this.getHeaders(accessToken) }
//     )
//     logger.info({ repoFullName, prNumber }, 'GitHub PR declined')
//   }

//   async getPRFiles(
//     accessToken: string,
//     repoFullName: string,
//     prNumber: number
//   ): Promise<IChangedFile[]> {
//     const { data } = await axios.get<GitHubFileData[]>(
//       `${GITHUB_API_BASE}/repos/${repoFullName}/pulls/${prNumber}/files`,
//       { headers: this.getHeaders(accessToken) }
//     )

//     return data.map((file) => ({
//       filename: file.filename,
//       status: file.status,
//       additions: file.additions,
//       deletions: file.deletions,
//       patch: file.patch?.slice(0, 3000),
//     }))
//   }

//   async registerWebhook(
//     accessToken: string,
//     repoFullName: string,
//     webhookUrl: string,
//     webhookSecret: string
//   ): Promise<string> {
//     const { data } = await axios.post(
//       `${GITHUB_API_BASE}/repos/${repoFullName}/hooks`,
//       {
//         name: 'web',
//         active: true,
//         events: ['pull_request', 'push', 'release'],
//         config: {
//           url: webhookUrl,
//           content_type: 'json',
//           secret: webhookSecret,
//           insecure_ssl: '0',
//         },
//       },
//       { headers: this.getHeaders(accessToken) }
//     )

//     logger.info({ repoFullName }, 'GitHub webhook registered')
//     return String(data.id)
//   }

//   async deleteWebhook(accessToken: string, repoFullName: string, webhookId: string): Promise<void> {
//     try {
//       await axios.delete(`${GITHUB_API_BASE}/repos/${repoFullName}/hooks/${webhookId}`, {
//         headers: this.getHeaders(accessToken),
//       })
//       logger.info({ repoFullName, webhookId }, 'GitHub webhook deleted')
//     } catch (error: any) {
//       if (error?.response?.status !== 404) {
//         logger.warn({ repoFullName, webhookId, error: error?.message }, 'Failed to delete GitHub webhook')
//       }
//     }
//   }

//   async getUserRepos(accessToken: string): Promise<ProviderRepoSummary[]> {
//     const { data } = await axios.get(
//       `${GITHUB_API_BASE}/user/repos?per_page=100&sort=updated`,
//       { headers: this.getHeaders(accessToken) }
//     )
//     return data.map((r: any) => ({
//       id: String(r.id),
//       full_name: r.full_name,
//       default_branch: r.default_branch,
//       private: r.private,
//     }))
//   }

//   async getRepo(accessToken: string, repoFullName: string): Promise<ProviderRepoSummary> {
//     const { data } = await axios.get(
//       `${GITHUB_API_BASE}/repos/${repoFullName}`,
//       { headers: this.getHeaders(accessToken) }
//     )
//     return { id: String(data.id), full_name: data.full_name, default_branch: data.default_branch, private: data.private, }
//   }

//   async getRepoFileTree(
//     accessToken: string,
//     repoFullName: string,
//     branch: string
//   ): Promise<string[]> {
//     try {
//       const { data } = await axios.get(
//         `${GITHUB_API_BASE}/repos/${repoFullName}/git/trees/${branch}?recursive=1`,
//         { headers: this.getHeaders(accessToken) }
//       )
//       return (data.tree ?? [])
//         .filter((item: any) => item.type === 'blob')
//         .map((item: any) => item.path as string)
//         .slice(0, 300)
//     } catch (error) {
//       logger.warn({ repoFullName }, 'Could not fetch repo file tree')
//       return []
//     }
//   }

//   async getFileContent(
//     accessToken: string,
//     repoFullName: string,
//     branch: string,
//     filePath: string
//   ): Promise<string | null> {
//     try {
//       const { data } = await axios.get(
//         `${GITHUB_API_BASE}/repos/${repoFullName}/contents/${filePath}${branch ? `?ref=${encodeURIComponent(branch)}` : ''}`,
//         { headers: this.getHeaders(accessToken) }
//       )
//       if (data.encoding === 'base64' && data.content) {
//         return Buffer.from(data.content, 'base64').toString('utf-8')
//       }
//       return null
//     } catch {
//       return null
//     }
//   }

//   async getRepoContext(
//     accessToken: string,
//     repoFullName: string,
//     branch: string
//   ): Promise<{ fileTree: string[]; packageJson: string | null; readme: string | null }> {
//     const fileTree = await this.getRepoFileTree(accessToken, repoFullName, branch)

//     const [packageJson, readme] = await Promise.all([
//       this.getFileContent(accessToken, repoFullName, branch, 'package.json'),
//       this.getFileContent(accessToken, repoFullName, branch, 'README.md'),
//     ])

//     return { fileTree, packageJson, readme }
//   }

//   // ── Agent tool-facing methods (additive) ──
//   async listDirectory(
//     accessToken: string,
//     repoFullName: string,
//     branch: string,
//     dirPath: string
//   ): Promise<{ path: string; type: 'file' | 'dir' }[]> {
//     const fileTree = await this.getRepoFileTree(accessToken, repoFullName, branch)
//     const prefix = dirPath ? `${dirPath.replace(/\/$/, '')}/` : ''

//     const seen = new Map<string, 'file' | 'dir'>()
//     for (const filePath of fileTree) {
//       if (!filePath.startsWith(prefix)) continue
//       const rest = filePath.slice(prefix.length)
//       if (!rest) continue
//       const slashIdx = rest.indexOf('/')
//       if (slashIdx === -1) {
//         seen.set(rest, 'file')
//       } else {
//         seen.set(rest.slice(0, slashIdx), 'dir')
//       }
//     }

//     return Array.from(seen.entries()).map(([path, type]) => ({ path, type }))
//   }

//   async readFile(
//     accessToken: string,
//     repoFullName: string,
//     branch: string,
//     filePath: string
//   ): Promise<string | null> {
//     return this.getFileContent(accessToken, repoFullName, branch, filePath)
//   }

// }

// export const githubService = new GitHubService()































import axios from 'axios'
import { IChangedFile } from '../globals/interfaces'
import { logger } from '../lib/logger'
import {
  IGitProviderService,
  ProviderRepoSummary,
  ProviderCommit,
  ProviderCommitsResult,
} from './providers/git-provider.interface'

const GITHUB_API_BASE = 'https://api.github.com'

interface GitHubPRData {
  title: string
  body: string
  number: number
  user: { login: string }
  base: { ref: string }
  head: { ref: string }
  html_url: string
  id: number
  merged_at: string | null
  state: string
}

interface GitHubCommitData {
  sha: string
  commit: {
    message: string
    author: { name: string; email: string; date: string } | null
  }
  author: { login: string; avatar_url: string } | null
  html_url: string
}

interface GitHubFileData {
  filename: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  additions: number
  deletions: number
  patch?: string
}

export class GitHubService implements IGitProviderService {

  private getHeaders(accessToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    }
  }

  async getPullRequest(
    accessToken: string,
    repoFullName: string,
    prNumber: number
  ): Promise<GitHubPRData> {
    const { data } = await axios.get<GitHubPRData>(
      `${GITHUB_API_BASE}/repos/${repoFullName}/pulls/${prNumber}`,
      { headers: this.getHeaders(accessToken) }
    )
    return data
  }

  async mergePullRequest(
    accessToken: string,
    repoFullName: string,
    prNumber: number,
    mergeMethod: string
  ): Promise<void> {
    await axios.put(
      `${GITHUB_API_BASE}/repos/${repoFullName}/pulls/${prNumber}/merge`,
      { merge_method: mergeMethod },
      { headers: this.getHeaders(accessToken) }
    )
    logger.info({ repoFullName, prNumber, mergeMethod }, 'GitHub PR merged')
  }

  async declinePullRequest(
    accessToken: string,
    repoFullName: string,
    prNumber: number,
    reason?: string
  ): Promise<void> {
    if (reason) {
      await axios.post(
        `${GITHUB_API_BASE}/repos/${repoFullName}/issues/${prNumber}/comments`,
        { body: reason },
        { headers: this.getHeaders(accessToken) }
      )
    }
    await axios.patch(
      `${GITHUB_API_BASE}/repos/${repoFullName}/pulls/${prNumber}`,
      { state: 'closed' },
      { headers: this.getHeaders(accessToken) }
    )
    logger.info({ repoFullName, prNumber }, 'GitHub PR declined')
  }

  async getPRFiles(
    accessToken: string,
    repoFullName: string,
    prNumber: number
  ): Promise<IChangedFile[]> {
    const { data } = await axios.get<GitHubFileData[]>(
      `${GITHUB_API_BASE}/repos/${repoFullName}/pulls/${prNumber}/files`,
      { headers: this.getHeaders(accessToken) }
    )

    return data.map((file) => ({
      filename: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      patch: file.patch?.slice(0, 3000),
    }))
  }

  async registerWebhook(
    accessToken: string,
    repoFullName: string,
    webhookUrl: string,
    webhookSecret: string
  ): Promise<string> {
    const { data } = await axios.post(
      `${GITHUB_API_BASE}/repos/${repoFullName}/hooks`,
      {
        name: 'web',
        active: true,
        events: ['pull_request', 'push', 'release'],
        config: {
          url: webhookUrl,
          content_type: 'json',
          secret: webhookSecret,
          insecure_ssl: '0',
        },
      },
      { headers: this.getHeaders(accessToken) }
    )

    logger.info({ repoFullName }, 'GitHub webhook registered')
    return String(data.id)
  }

  async deleteWebhook(accessToken: string, repoFullName: string, webhookId: string): Promise<void> {
    try {
      await axios.delete(`${GITHUB_API_BASE}/repos/${repoFullName}/hooks/${webhookId}`, {
        headers: this.getHeaders(accessToken),
      })
      logger.info({ repoFullName, webhookId }, 'GitHub webhook deleted')
    } catch (error: any) {
      if (error?.response?.status !== 404) {
        logger.warn({ repoFullName, webhookId, error: error?.message }, 'Failed to delete GitHub webhook')
      }
    }
  }

  async getUserRepos(accessToken: string): Promise<ProviderRepoSummary[]> {
    const { data } = await axios.get(
      `${GITHUB_API_BASE}/user/repos?per_page=100&sort=updated`,
      { headers: this.getHeaders(accessToken) }
    )
    return data.map((r: any) => ({
      id: String(r.id),
      full_name: r.full_name,
      default_branch: r.default_branch,
      private: r.private,
    }))
  }

  // GitHub's Link header looks like:
  // <...?page=2>; rel="next", <...?page=8>; rel="last"
  // We parse out the page number for a given rel.
  private parsePageFromLinkHeader(linkHeader: string | undefined, rel: 'next' | 'last'): number | null {
    if (!linkHeader) return null
    const part = linkHeader.split(',').find((p) => p.includes(`rel="${rel}"`))
    if (!part) return null
    const urlMatch = part.match(/<([^>]+)>/)
    if (!urlMatch) return null
    try {
      const page = new URL(urlMatch[1]).searchParams.get('page')
      return page ? parseInt(page, 10) : null
    } catch {
      return null
    }
  }

  async getCommits(
    accessToken: string,
    repoFullName: string,
    branch: string,
    page: number,
    perPage: number
  ): Promise<ProviderCommitsResult> {
    const { data, headers } = await axios.get<GitHubCommitData[]>(
      `${GITHUB_API_BASE}/repos/${repoFullName}/commits`,
      {
        headers: this.getHeaders(accessToken),
        params: { sha: branch, page, per_page: perPage },
      }
    )

    const commits: ProviderCommit[] = data.map((c) => ({
      sha: c.sha,
      message: c.commit.message ?? '',
      author: {
        name: c.commit.author?.name ?? c.author?.login ?? 'Unknown',
        email: c.commit.author?.email,
        login: c.author?.login,
        avatarUrl: c.author?.avatar_url,
      },
      date: c.commit.author?.date ?? '',
      url: c.html_url,
    }))

    const lastPage = this.parsePageFromLinkHeader(headers['link'], 'last')
    const nextPage = this.parsePageFromLinkHeader(headers['link'], 'next')
    const hasMore = lastPage !== null ? page < lastPage : nextPage !== null || data.length === perPage

    let totalCount: number | null = null
    let totalIsApproximate = true

    // Exact-count trick: with per_page=1, GitHub's "last" page number in the
    // Link header IS the total commit count on this branch. Only do this on
    // page 1 so we don't fire an extra request on every page turn.
    if (page === 1) {
      try {
        const countRes = await axios.get<GitHubCommitData[]>(
          `${GITHUB_API_BASE}/repos/${repoFullName}/commits`,
          { headers: this.getHeaders(accessToken), params: { sha: branch, page: 1, per_page: 1 } }
        )
        const lastPageForCount = this.parsePageFromLinkHeader(countRes.headers['link'], 'last')
        if (lastPageForCount !== null) {
          totalCount = lastPageForCount
          totalIsApproximate = false
        } else {
          // No Link header at all → branch has 0 or 1 commit total.
          totalCount = countRes.data.length
          totalIsApproximate = false
        }
      } catch (error) {
        logger.warn({ repoFullName, branch }, 'Could not compute exact GitHub commit count')
      }
    }

    return { commits, page, perPage, hasMore, totalCount, totalIsApproximate }
  }

  async getRepo(accessToken: string, repoFullName: string): Promise<ProviderRepoSummary> {
    const { data } = await axios.get(
      `${GITHUB_API_BASE}/repos/${repoFullName}`,
      { headers: this.getHeaders(accessToken) }
    )
    return { id: String(data.id), full_name: data.full_name, default_branch: data.default_branch, private: data.private, }
  }

  async getRepoFileTree(
    accessToken: string,
    repoFullName: string,
    branch: string
  ): Promise<string[]> {
    try {
      const { data } = await axios.get(
        `${GITHUB_API_BASE}/repos/${repoFullName}/git/trees/${branch}?recursive=1`,
        { headers: this.getHeaders(accessToken) }
      )
      return (data.tree ?? [])
        .filter((item: any) => item.type === 'blob')
        .map((item: any) => item.path as string)
        .slice(0, 300)
    } catch (error) {
      logger.warn({ repoFullName }, 'Could not fetch repo file tree')
      return []
    }
  }

  async getFileContent(
    accessToken: string,
    repoFullName: string,
    branch: string,
    filePath: string
  ): Promise<string | null> {
    try {
      const { data } = await axios.get(
        `${GITHUB_API_BASE}/repos/${repoFullName}/contents/${filePath}${branch ? `?ref=${encodeURIComponent(branch)}` : ''}`,
        { headers: this.getHeaders(accessToken) }
      )
      if (data.encoding === 'base64' && data.content) {
        return Buffer.from(data.content, 'base64').toString('utf-8')
      }
      return null
    } catch {
      return null
    }
  }

  async getRepoContext(
    accessToken: string,
    repoFullName: string,
    branch: string
  ): Promise<{ fileTree: string[]; packageJson: string | null; readme: string | null }> {
    const fileTree = await this.getRepoFileTree(accessToken, repoFullName, branch)

    const [packageJson, readme] = await Promise.all([
      this.getFileContent(accessToken, repoFullName, branch, 'package.json'),
      this.getFileContent(accessToken, repoFullName, branch, 'README.md'),
    ])

    return { fileTree, packageJson, readme }
  }

  // ── Agent tool-facing methods (additive) ──
  async listDirectory(
    accessToken: string,
    repoFullName: string,
    branch: string,
    dirPath: string
  ): Promise<{ path: string; type: 'file' | 'dir' }[]> {
    const fileTree = await this.getRepoFileTree(accessToken, repoFullName, branch)
    const prefix = dirPath ? `${dirPath.replace(/\/$/, '')}/` : ''

    const seen = new Map<string, 'file' | 'dir'>()
    for (const filePath of fileTree) {
      if (!filePath.startsWith(prefix)) continue
      const rest = filePath.slice(prefix.length)
      if (!rest) continue
      const slashIdx = rest.indexOf('/')
      if (slashIdx === -1) {
        seen.set(rest, 'file')
      } else {
        seen.set(rest.slice(0, slashIdx), 'dir')
      }
    }

    return Array.from(seen.entries()).map(([path, type]) => ({ path, type }))
  }

  async readFile(
    accessToken: string,
    repoFullName: string,
    branch: string,
    filePath: string
  ): Promise<string | null> {
    return this.getFileContent(accessToken, repoFullName, branch, filePath)
  }

}

export const githubService = new GitHubService()
