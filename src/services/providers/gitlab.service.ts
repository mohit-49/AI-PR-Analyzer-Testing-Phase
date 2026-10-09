// import axios from 'axios'
// import { IGitProviderService, ProviderPRData, ProviderChangedFile, ProviderRepoSummary } from './git-provider.interface'
// import { logger } from '../../lib/logger'

// const GITLAB_API_BASE = 'https://gitlab.com/api/v4'

// function encodeProjectPath(repoFullName: string): string {
//   return encodeURIComponent(repoFullName)
// }

// export class GitLabService implements IGitProviderService {

//   private getHeaders(accessToken: string): Record<string, string> {
//     return { Authorization: `Bearer ${accessToken}` }
//   }

//   async getUserRepos(accessToken: string): Promise<ProviderRepoSummary[]> {
//     const { data } = await axios.get(
//       `${GITLAB_API_BASE}/projects?membership=true&per_page=100&order_by=last_activity_at`,
//       { headers: this.getHeaders(accessToken) }
//     )
//     return data.map((p: any) => ({
//       id: String(p.id),
//       full_name: p.path_with_namespace,
//       default_branch: p.default_branch ?? 'main',
//       private: p.visibility !== 'public',
//     }))
//   }

//   async getRepo(accessToken: string, repoFullName: string): Promise<ProviderRepoSummary> {
//     const { data } = await axios.get(`${GITLAB_API_BASE}/projects/${encodeProjectPath(repoFullName)}`, {
//       headers: this.getHeaders(accessToken),
//     })
//     return {
//       id: String(data.id),
//       full_name: data.path_with_namespace,
//       default_branch: data.default_branch ?? 'main',
//       private: data.visibility !== 'public',
//     }
//   }

//   async registerWebhook(
//     accessToken: string,
//     repoFullName: string,
//     webhookUrl: string,
//     webhookSecret: string
//   ): Promise<string> {
//     const { data } = await axios.post(
//       `${GITLAB_API_BASE}/projects/${encodeProjectPath(repoFullName)}/hooks`,
//       {
//         url: webhookUrl,
//         token: webhookSecret,
//         merge_requests_events: true,
//         push_events: false,
//         enable_ssl_verification: true,
//       },
//       { headers: this.getHeaders(accessToken) }
//     )
//     return String(data.id)
//   }

//   async deleteWebhook(accessToken: string, repoFullName: string, webhookId: string): Promise<void> {
//     await axios.delete(`${GITLAB_API_BASE}/projects/${encodeProjectPath(repoFullName)}/hooks/${webhookId}`, {
//       headers: this.getHeaders(accessToken),
//     })
//   }

//   async mergePullRequest(
//     accessToken: string,
//     repoFullName: string,
//     prNumber: number,
//     mergeMethod: string
//   ): Promise<void> {
//     await axios.put(
//       `${GITLAB_API_BASE}/projects/${encodeProjectPath(repoFullName)}/merge_requests/${prNumber}/merge`,
//       {
//         squash: mergeMethod === 'squash',
//       },
//       { headers: this.getHeaders(accessToken) }
//     )
//   }

//   async declinePullRequest(accessToken: string, repoFullName: string, prNumber: number, reason?: string): Promise<void> {
//     await axios.put(
//       `${GITLAB_API_BASE}/projects/${encodeProjectPath(repoFullName)}/merge_requests/${prNumber}`,
//       { state_event: 'close' },
//       { headers: this.getHeaders(accessToken) }
//     )
//     if (reason) logger.info({ repoFullName, prNumber, reason }, 'GitLab MR declined')
//   }

//   async getPullRequest(accessToken: string, repoFullName: string, prNumber: number): Promise<ProviderPRData> {
//     const { data } = await axios.get(
//       `${GITLAB_API_BASE}/projects/${encodeProjectPath(repoFullName)}/merge_requests/${prNumber}`,
//       { headers: this.getHeaders(accessToken) }
//     )
//     return {
//       title: data.title,
//       body: data.description ?? '',
//       user: { login: data.author?.username ?? 'unknown' },
//       base: { ref: data.target_branch },
//       head: { ref: data.source_branch },
//       html_url: data.web_url,
//       state: data.state,
//     }
//   }

//   async getPRFiles(accessToken: string, repoFullName: string, prNumber: number): Promise<ProviderChangedFile[]> {
//     const { data } = await axios.get(
//       `${GITLAB_API_BASE}/projects/${encodeProjectPath(repoFullName)}/merge_requests/${prNumber}/diffs`,
//       { headers: this.getHeaders(accessToken) }
//     )
//     return data.map((f: any) => ({
//       filename: f.new_path ?? f.old_path,
//       status: f.new_file ? 'added' : f.deleted_file ? 'deleted' : f.renamed_file ? 'renamed' : 'modified',
//       additions: 0,
//       deletions: 0,
//       patch: f.diff ?? '',
//     }))
//   }

//   async readFile(accessToken: string, repoFullName: string, branch: string, filePath: string): Promise<string | null> {
//     try {
//       const { data } = await axios.get(
//         `${GITLAB_API_BASE}/projects/${encodeProjectPath(repoFullName)}/repository/files/${encodeURIComponent(filePath)}/raw`,
//         { headers: this.getHeaders(accessToken), params: { ref: branch }, responseType: 'text' }
//       )
//       return data as unknown as string
//     } catch {
//       return null
//     }
//   }

//   async listDirectory(
//     accessToken: string,
//     repoFullName: string,
//     branch: string,
//     dirPath: string
//   ): Promise<{ path: string; type: 'file' | 'dir' }[]> {
//     const { data } = await axios.get(
//       `${GITLAB_API_BASE}/projects/${encodeProjectPath(repoFullName)}/repository/tree`,
//       { headers: this.getHeaders(accessToken), params: { path: dirPath, ref: branch, per_page: 100 } }
//     )
//     return data.map((entry: any) => ({
//       path: entry.name,
//       type: entry.type === 'tree' ? 'dir' : 'file',
//     }))
//   }

//   async getRepoContext(
//     accessToken: string,
//     repoFullName: string,
//     branch: string
//   ): Promise<{ fileTree: string[]; packageJson: string | null; readme: string | null }> {
//     const [packageJson, readme, rootEntries] = await Promise.all([
//       this.readFile(accessToken, repoFullName, branch, 'package.json'),
//       this.readFile(accessToken, repoFullName, branch, 'README.md'),
//       this.listDirectory(accessToken, repoFullName, branch, ''),
//     ])
//     return { fileTree: rootEntries.map((e) => e.path), packageJson, readme }
//   }
  
// }

// export const gitlabService = new GitLabService()




















import axios from 'axios'
import { IGitProviderService, ProviderPRData, ProviderChangedFile, ProviderRepoSummary, ProviderCommit, ProviderCommitsResult } from './git-provider.interface'
import { logger } from '../../lib/logger'

const GITLAB_API_BASE = 'https://gitlab.com/api/v4'

function encodeProjectPath(repoFullName: string): string {
  return encodeURIComponent(repoFullName)
}

export class GitLabService implements IGitProviderService {

  private getHeaders(accessToken: string): Record<string, string> {
    return { Authorization: `Bearer ${accessToken}` }
  }

  async getUserRepos(accessToken: string): Promise<ProviderRepoSummary[]> {
    const { data } = await axios.get(
      `${GITLAB_API_BASE}/projects?membership=true&per_page=100&order_by=last_activity_at`,
      { headers: this.getHeaders(accessToken) }
    )
    return data.map((p: any) => ({
      id: String(p.id),
      full_name: p.path_with_namespace,
      default_branch: p.default_branch ?? 'main',
      private: p.visibility !== 'public',
    }))
  }

  async getRepo(accessToken: string, repoFullName: string): Promise<ProviderRepoSummary> {
    const { data } = await axios.get(`${GITLAB_API_BASE}/projects/${encodeProjectPath(repoFullName)}`, {
      headers: this.getHeaders(accessToken),
    })
    return {
      id: String(data.id),
      full_name: data.path_with_namespace,
      default_branch: data.default_branch ?? 'main',
      private: data.visibility !== 'public',
    }
  }

  async getCommits(
    accessToken: string,
    repoFullName: string,
    branch: string,
    page: number,
    perPage: number
  ): Promise<ProviderCommitsResult> {
    const { data, headers } = await axios.get(
      `${GITLAB_API_BASE}/projects/${encodeProjectPath(repoFullName)}/repository/commits`,
      {
        headers: this.getHeaders(accessToken),
        params: { ref_name: branch, page, per_page: perPage },
      }
    )

    const commits: ProviderCommit[] = data.map((c: any) => ({
      sha: c.id,
      message: c.message ?? c.title ?? '',
      author: {
        name: c.author_name ?? 'Unknown',
        email: c.author_email,
      },
      date: c.authored_date ?? c.created_at ?? '',
      url: c.web_url,
    }))

    // GitLab returns X-Total / X-Total-Pages / X-Next-Page on offset pagination.
    // On very large projects GitLab may omit these for performance — in that
    // case we fall back to "approximate" and rely on X-Next-Page for hasMore.
    const totalHeader = headers['x-total']
    const nextPageHeader = headers['x-next-page']
    const totalCount = totalHeader ? parseInt(totalHeader, 10) : null

    return {
      commits,
      page,
      perPage,
      hasMore: totalHeader ? Boolean(nextPageHeader) : data.length === perPage,
      totalCount,
      totalIsApproximate: totalCount === null,
    }
  }

  async registerWebhook(
    accessToken: string,
    repoFullName: string,
    webhookUrl: string,
    webhookSecret: string
  ): Promise<string> {
    const { data } = await axios.post(
      `${GITLAB_API_BASE}/projects/${encodeProjectPath(repoFullName)}/hooks`,
      {
        url: webhookUrl,
        token: webhookSecret,
        merge_requests_events: true,
        push_events: false,
        enable_ssl_verification: true,
      },
      { headers: this.getHeaders(accessToken) }
    )
    return String(data.id)
  }

  async deleteWebhook(accessToken: string, repoFullName: string, webhookId: string): Promise<void> {
    await axios.delete(`${GITLAB_API_BASE}/projects/${encodeProjectPath(repoFullName)}/hooks/${webhookId}`, {
      headers: this.getHeaders(accessToken),
    })
  }

  async mergePullRequest(
    accessToken: string,
    repoFullName: string,
    prNumber: number,
    mergeMethod: string
  ): Promise<void> {
    await axios.put(
      `${GITLAB_API_BASE}/projects/${encodeProjectPath(repoFullName)}/merge_requests/${prNumber}/merge`,
      {
        squash: mergeMethod === 'squash',
      },
      { headers: this.getHeaders(accessToken) }
    )
  }

  async declinePullRequest(accessToken: string, repoFullName: string, prNumber: number, reason?: string): Promise<void> {
    await axios.put(
      `${GITLAB_API_BASE}/projects/${encodeProjectPath(repoFullName)}/merge_requests/${prNumber}`,
      { state_event: 'close' },
      { headers: this.getHeaders(accessToken) }
    )
    if (reason) logger.info({ repoFullName, prNumber, reason }, 'GitLab MR declined')
  }

  async getPullRequest(accessToken: string, repoFullName: string, prNumber: number): Promise<ProviderPRData> {
    const { data } = await axios.get(
      `${GITLAB_API_BASE}/projects/${encodeProjectPath(repoFullName)}/merge_requests/${prNumber}`,
      { headers: this.getHeaders(accessToken) }
    )
    return {
      title: data.title,
      body: data.description ?? '',
      user: { login: data.author?.username ?? 'unknown' },
      base: { ref: data.target_branch },
      head: { ref: data.source_branch },
      html_url: data.web_url,
      state: data.state,
    }
  }

  async getPRFiles(accessToken: string, repoFullName: string, prNumber: number): Promise<ProviderChangedFile[]> {
    const { data } = await axios.get(
      `${GITLAB_API_BASE}/projects/${encodeProjectPath(repoFullName)}/merge_requests/${prNumber}/diffs`,
      { headers: this.getHeaders(accessToken) }
    )
    return data.map((f: any) => ({
      filename: f.new_path ?? f.old_path,
      status: f.new_file ? 'added' : f.deleted_file ? 'deleted' : f.renamed_file ? 'renamed' : 'modified',
      additions: 0,
      deletions: 0,
      patch: f.diff ?? '',
    }))
  }

  async readFile(accessToken: string, repoFullName: string, branch: string, filePath: string): Promise<string | null> {
    try {
      const { data } = await axios.get(
        `${GITLAB_API_BASE}/projects/${encodeProjectPath(repoFullName)}/repository/files/${encodeURIComponent(filePath)}/raw`,
        { headers: this.getHeaders(accessToken), params: { ref: branch }, responseType: 'text' }
      )
      return data as unknown as string
    } catch {
      return null
    }
  }

  async listDirectory(
    accessToken: string,
    repoFullName: string,
    branch: string,
    dirPath: string
  ): Promise<{ path: string; type: 'file' | 'dir' }[]> {
    const { data } = await axios.get(
      `${GITLAB_API_BASE}/projects/${encodeProjectPath(repoFullName)}/repository/tree`,
      { headers: this.getHeaders(accessToken), params: { path: dirPath, ref: branch, per_page: 100 } }
    )
    return data.map((entry: any) => ({
      path: entry.name,
      type: entry.type === 'tree' ? 'dir' : 'file',
    }))
  }

  async getRepoContext(
    accessToken: string,
    repoFullName: string,
    branch: string
  ): Promise<{ fileTree: string[]; packageJson: string | null; readme: string | null }> {
    const [packageJson, readme, rootEntries] = await Promise.all([
      this.readFile(accessToken, repoFullName, branch, 'package.json'),
      this.readFile(accessToken, repoFullName, branch, 'README.md'),
      this.listDirectory(accessToken, repoFullName, branch, ''),
    ])
    return { fileTree: rootEntries.map((e) => e.path), packageJson, readme }
  }
  
}

export const gitlabService = new GitLabService()