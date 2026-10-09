// import axios from 'axios'
// import { IChangedFile } from '@/globals/interfaces'
// import { logger } from '@/lib/logger'
// import { IGitProviderService, ProviderRepoSummary, ProviderPRData } from './git-provider.interface'

// const BITBUCKET_API_BASE = 'https://api.bitbucket.org/2.0'

// export class BitbucketService implements IGitProviderService {

//   private getHeaders(accessToken: string): Record<string, string> {
//     return {
//       Authorization: `Bearer ${accessToken}`,
//       Accept: 'application/json',
//     }
//   }

//   async mergePullRequest(
//     accessToken: string,
//     repoFullName: string,
//     prNumber: number,
//     mergeMethod: string
//   ): Promise<void> {
//     await axios.post(
//       `${BITBUCKET_API_BASE}/repositories/${repoFullName}/pullrequests/${prNumber}/merge`,
//       { merge_strategy: mergeMethod },
//       { headers: this.getHeaders(accessToken) }
//     )
//     logger.info({ repoFullName, prNumber, mergeMethod }, 'Bitbucket PR merged')
//   }

//   async declinePullRequest(
//     accessToken: string,
//     repoFullName: string,
//     prNumber: number,
//     reason?: string
//   ): Promise<void> {
//     if (reason) {
//       await axios.post(
//         `${BITBUCKET_API_BASE}/repositories/${repoFullName}/pullrequests/${prNumber}/comments`,
//         { content: { raw: reason } },
//         { headers: this.getHeaders(accessToken) }
//       )
//     }
//     await axios.post(
//       `${BITBUCKET_API_BASE}/repositories/${repoFullName}/pullrequests/${prNumber}/decline`,
//       {},
//       { headers: this.getHeaders(accessToken) }
//     )
//     logger.info({ repoFullName, prNumber }, 'Bitbucket PR declined')
//   }

//   async getUserRepos(accessToken: string): Promise<ProviderRepoSummary[]> {
//     const workspacesResponse = await axios.get(
//       `${BITBUCKET_API_BASE}/user/workspaces?pagelen=100`,
//       { headers: this.getHeaders(accessToken) }
//     )

//     const workspaceSlugs: string[] = (workspacesResponse.data.values ?? []).map(
//       (w: any) => w.workspace?.slug
//     )

//     if (workspaceSlugs.length === 0) return []

//     const repoResponses = await Promise.all(
//       workspaceSlugs.map((slug) =>
//         axios
//           .get(`${BITBUCKET_API_BASE}/repositories/${slug}?pagelen=100`, {
//             headers: this.getHeaders(accessToken),
//           })
//           .then((res) => res.data.values ?? [])
//           .catch(() => [])
//       )
//     )
//     return repoResponses.flat().map((r: any) => ({
//       id: r.uuid,
//       full_name: r.full_name,
//       default_branch: r.mainbranch?.name ?? 'main',
//       private: r.is_private,
//     }))
//   }

//   async getRepo(accessToken: string, repoFullName: string): Promise<ProviderRepoSummary> {
//     const { data } = await axios.get(
//       `${BITBUCKET_API_BASE}/repositories/${repoFullName}`,
//       { headers: this.getHeaders(accessToken) }
//     )
//     return {
//       id: data.uuid,
//       full_name: data.full_name,
//       default_branch: data.mainbranch?.name ?? 'main',
//       private: data.is_private,
//     }
//   }

//   async registerWebhook(
//     accessToken: string,
//     repoFullName: string,
//     webhookUrl: string,
//     webhookSecret: string
//   ): Promise<string> {
//     const { data } = await axios.post(
//       `${BITBUCKET_API_BASE}/repositories/${repoFullName}/hooks`,
//       {
//         description: 'AI PR Analyzer',
//         url: webhookUrl,
//         active: true,
//         events: ['pullrequest:created', 'pullrequest:updated', 'repo:push'],
//         secret: webhookSecret,
//       },
//       { headers: this.getHeaders(accessToken) }
//     )

//     logger.info({ repoFullName }, 'Bitbucket webhook registered')
//     return String(data.uuid)
//   }

//   async deleteWebhook(accessToken: string, repoFullName: string, webhookId: string): Promise<void> {
//     try {
//       await axios.delete(`${BITBUCKET_API_BASE}/repositories/${repoFullName}/hooks/${webhookId}`, {
//         headers: this.getHeaders(accessToken),
//       })
//       logger.info({ repoFullName, webhookId }, 'Bitbucket webhook deleted')
//     } catch (error: any) {
//       if (error?.response?.status !== 404) {
//         logger.warn({ repoFullName, webhookId, error: error?.message }, 'Failed to delete Bitbucket webhook')
//       }
//     }
//   }

//   async getPullRequest(
//     accessToken: string,
//     repoFullName: string,
//     prNumber: number
//   ): Promise<ProviderPRData> {
//     const { data } = await axios.get(
//       `${BITBUCKET_API_BASE}/repositories/${repoFullName}/pullrequests/${prNumber}`,
//       { headers: this.getHeaders(accessToken) }
//     )

//     return {
//       title: data.title,
//       body: data.description ?? '',
//       user: { login: data.author?.display_name ?? data.author?.nickname ?? 'unknown' },
//       base: { ref: data.destination?.branch?.name ?? '' },
//       head: { ref: data.source?.branch?.name ?? '' },
//       html_url: data.links?.html?.href ?? '',
//       state: data.state,
//     }
//   }

//   async getPRFiles(
//     accessToken: string,
//     repoFullName: string,
//     prNumber: number
//   ): Promise<IChangedFile[]> {
//     const { data } = await axios.get(
//       `${BITBUCKET_API_BASE}/repositories/${repoFullName}/pullrequests/${prNumber}/diffstat`,
//       { headers: this.getHeaders(accessToken) }
//     )

//     let rawDiff = ''
//     try {
//       const diffResponse = await axios.get(
//         `${BITBUCKET_API_BASE}/repositories/${repoFullName}/pullrequests/${prNumber}/diff`,
//         { headers: this.getHeaders(accessToken), responseType: 'text' }
//       )
//       rawDiff = diffResponse.data as unknown as string
//     } catch (error) {
//       logger.warn({ repoFullName, prNumber }, 'Could not fetch Bitbucket PR diff text')
//     }

//     const statusMap: Record<string, IChangedFile['status']> = {
//       added: 'added',
//       removed: 'deleted',
//       modified: 'modified',
//       renamed: 'renamed',
//     }

//     return (data.values ?? []).map((f: any) => {
//       const filename = f.new?.path ?? f.old?.path ?? 'unknown'
//       const filePatch = this.extractFilePatch(rawDiff, filename)

//       return {
//         filename,
//         status: statusMap[f.status] ?? 'modified',
//         additions: f.lines_added ?? 0,
//         deletions: f.lines_removed ?? 0,
//         patch: filePatch?.slice(0, 3000),
//       }
//     })
//   }

//   private extractFilePatch(rawDiff: string, filename: string): string | undefined {
//     if (!rawDiff) return undefined
//     const marker = `diff --git a/${filename} b/${filename}`
//     const startIdx = rawDiff.indexOf(marker)
//     if (startIdx === -1) return undefined
//     const nextMarkerIdx = rawDiff.indexOf('\ndiff --git', startIdx + marker.length)
//     return nextMarkerIdx === -1 ? rawDiff.slice(startIdx) : rawDiff.slice(startIdx, nextMarkerIdx)
//   }

//   async getFileContent(
//     accessToken: string,
//     repoFullName: string,
//     branch: string,
//     filePath: string
//   ): Promise<string | null> {
//     try {
//       const { data } = await axios.get(
//         `${BITBUCKET_API_BASE}/repositories/${repoFullName}/src/${branch}/${filePath}`,
//         { headers: this.getHeaders(accessToken), responseType: 'text' }
//       )
//       return data as unknown as string
//     } catch {
//       return null
//     }
//   }

//   private async getRepoFileTree(accessToken: string, repoFullName: string, branch: string): Promise<string[]> {
//     try {
//       const { data } = await axios.get(
//         `${BITBUCKET_API_BASE}/repositories/${repoFullName}/src/${branch}/?max_depth=10&pagelen=100`,
//         { headers: this.getHeaders(accessToken) }
//       )
//       return (data.values ?? [])
//         .filter((item: any) => item.type === 'commit_file')
//         .map((item: any) => item.path as string)
//         .slice(0, 300)
//     } catch (error) {
//       logger.warn({ repoFullName }, 'Could not fetch Bitbucket repo file tree')
//       return []
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

//   // ── Agent tool-facing methods (additive — reuse the existing private helpers above) ──

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

// export const bitbucketService = new BitbucketService()







// ***********************************************



import axios from 'axios'
import { IChangedFile } from '@/globals/interfaces'
import { logger } from '@/lib/logger'
import { IGitProviderService, ProviderRepoSummary, ProviderPRData, ProviderCommit, ProviderCommitsResult } from './git-provider.interface'

const BITBUCKET_API_BASE = 'https://api.bitbucket.org/2.0'

export class BitbucketService implements IGitProviderService {

  private getHeaders(accessToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    }
  }

  async mergePullRequest(
    accessToken: string,
    repoFullName: string,
    prNumber: number,
    mergeMethod: string
  ): Promise<void> {
    await axios.post(
      `${BITBUCKET_API_BASE}/repositories/${repoFullName}/pullrequests/${prNumber}/merge`,
      { merge_strategy: mergeMethod },
      { headers: this.getHeaders(accessToken) }
    )
    logger.info({ repoFullName, prNumber, mergeMethod }, 'Bitbucket PR merged')
  }

  async declinePullRequest(
    accessToken: string,
    repoFullName: string,
    prNumber: number,
    reason?: string
  ): Promise<void> {
    if (reason) {
      await axios.post(
        `${BITBUCKET_API_BASE}/repositories/${repoFullName}/pullrequests/${prNumber}/comments`,
        { content: { raw: reason } },
        { headers: this.getHeaders(accessToken) }
      )
    }
    await axios.post(
      `${BITBUCKET_API_BASE}/repositories/${repoFullName}/pullrequests/${prNumber}/decline`,
      {},
      { headers: this.getHeaders(accessToken) }
    )
    logger.info({ repoFullName, prNumber }, 'Bitbucket PR declined')
  }

  async getUserRepos(accessToken: string): Promise<ProviderRepoSummary[]> {
    const workspacesResponse = await axios.get(
      `${BITBUCKET_API_BASE}/user/workspaces?pagelen=100`,
      { headers: this.getHeaders(accessToken) }
    )

    const workspaceSlugs: string[] = (workspacesResponse.data.values ?? []).map(
      (w: any) => w.workspace?.slug
    )

    if (workspaceSlugs.length === 0) return []

    const repoResponses = await Promise.all(
      workspaceSlugs.map((slug) =>
        axios
          .get(`${BITBUCKET_API_BASE}/repositories/${slug}?pagelen=100`, {
            headers: this.getHeaders(accessToken),
          })
          .then((res) => res.data.values ?? [])
          .catch(() => [])
      )
    )
    return repoResponses.flat().map((r: any) => ({
      id: r.uuid,
      full_name: r.full_name,
      default_branch: r.mainbranch?.name ?? 'main',
      private: r.is_private,
    }))
  }

  async getCommits(
    accessToken: string,
    repoFullName: string,
    branch: string,
    page: number,
    perPage: number
  ): Promise<ProviderCommitsResult> {
    const { data } = await axios.get(
      `${BITBUCKET_API_BASE}/repositories/${repoFullName}/commits/${branch}`,
      { headers: this.getHeaders(accessToken), params: { pagelen: perPage, page } }
    )

    const commits: ProviderCommit[] = (data.values ?? []).map((c: any) => ({
      sha: c.hash,
      message: c.message ?? '',
      author: {
        name: c.author?.user?.display_name ?? c.author?.raw ?? 'Unknown',
        login: c.author?.user?.nickname,
        avatarUrl: c.author?.user?.links?.avatar?.href,
      },
      date: c.date,
      url: c.links?.html?.href ?? '',
    }))

    // Bitbucket's commits endpoint has no total-count field (unlike
    // pull-requests, which returns `size`) — git history size isn't cheap to
    // compute server-side, so we only get page-by-page `next` links here.
    return {
      commits,
      page,
      perPage,
      hasMore: Boolean(data.next),
      totalCount: null,
      totalIsApproximate: true,
    }
  }

  async getRepo(accessToken: string, repoFullName: string): Promise<ProviderRepoSummary> {
    const { data } = await axios.get(
      `${BITBUCKET_API_BASE}/repositories/${repoFullName}`,
      { headers: this.getHeaders(accessToken) }
    )
    return {
      id: data.uuid,
      full_name: data.full_name,
      default_branch: data.mainbranch?.name ?? 'main',
      private: data.is_private,
    }
  }

  async registerWebhook(
    accessToken: string,
    repoFullName: string,
    webhookUrl: string,
    webhookSecret: string
  ): Promise<string> {
    const { data } = await axios.post(
      `${BITBUCKET_API_BASE}/repositories/${repoFullName}/hooks`,
      {
        description: 'AI PR Analyzer',
        url: webhookUrl,
        active: true,
        events: ['pullrequest:created', 'pullrequest:updated', 'repo:push'],
        secret: webhookSecret,
      },
      { headers: this.getHeaders(accessToken) }
    )

    logger.info({ repoFullName }, 'Bitbucket webhook registered')
    return String(data.uuid)
  }

  async deleteWebhook(accessToken: string, repoFullName: string, webhookId: string): Promise<void> {
    try {
      await axios.delete(`${BITBUCKET_API_BASE}/repositories/${repoFullName}/hooks/${webhookId}`, {
        headers: this.getHeaders(accessToken),
      })
      logger.info({ repoFullName, webhookId }, 'Bitbucket webhook deleted')
    } catch (error: any) {
      if (error?.response?.status !== 404) {
        logger.warn({ repoFullName, webhookId, error: error?.message }, 'Failed to delete Bitbucket webhook')
      }
    }
  }

  async getPullRequest(
    accessToken: string,
    repoFullName: string,
    prNumber: number
  ): Promise<ProviderPRData> {
    const { data } = await axios.get(
      `${BITBUCKET_API_BASE}/repositories/${repoFullName}/pullrequests/${prNumber}`,
      { headers: this.getHeaders(accessToken) }
    )

    return {
      title: data.title,
      body: data.description ?? '',
      user: { login: data.author?.display_name ?? data.author?.nickname ?? 'unknown' },
      base: { ref: data.destination?.branch?.name ?? '' },
      head: { ref: data.source?.branch?.name ?? '' },
      html_url: data.links?.html?.href ?? '',
      state: data.state,
    }
  }

  async getPRFiles(
    accessToken: string,
    repoFullName: string,
    prNumber: number
  ): Promise<IChangedFile[]> {
    const { data } = await axios.get(
      `${BITBUCKET_API_BASE}/repositories/${repoFullName}/pullrequests/${prNumber}/diffstat`,
      { headers: this.getHeaders(accessToken) }
    )

    let rawDiff = ''
    try {
      const diffResponse = await axios.get(
        `${BITBUCKET_API_BASE}/repositories/${repoFullName}/pullrequests/${prNumber}/diff`,
        { headers: this.getHeaders(accessToken), responseType: 'text' }
      )
      rawDiff = diffResponse.data as unknown as string
    } catch (error) {
      logger.warn({ repoFullName, prNumber }, 'Could not fetch Bitbucket PR diff text')
    }

    const statusMap: Record<string, IChangedFile['status']> = {
      added: 'added',
      removed: 'deleted',
      modified: 'modified',
      renamed: 'renamed',
    }

    return (data.values ?? []).map((f: any) => {
      const filename = f.new?.path ?? f.old?.path ?? 'unknown'
      const filePatch = this.extractFilePatch(rawDiff, filename)

      return {
        filename,
        status: statusMap[f.status] ?? 'modified',
        additions: f.lines_added ?? 0,
        deletions: f.lines_removed ?? 0,
        patch: filePatch?.slice(0, 3000),
      }
    })
  }

  private extractFilePatch(rawDiff: string, filename: string): string | undefined {
    if (!rawDiff) return undefined
    const marker = `diff --git a/${filename} b/${filename}`
    const startIdx = rawDiff.indexOf(marker)
    if (startIdx === -1) return undefined
    const nextMarkerIdx = rawDiff.indexOf('\ndiff --git', startIdx + marker.length)
    return nextMarkerIdx === -1 ? rawDiff.slice(startIdx) : rawDiff.slice(startIdx, nextMarkerIdx)
  }

  async getFileContent(
    accessToken: string,
    repoFullName: string,
    branch: string,
    filePath: string
  ): Promise<string | null> {
    try {
      const { data } = await axios.get(
        `${BITBUCKET_API_BASE}/repositories/${repoFullName}/src/${branch}/${filePath}`,
        { headers: this.getHeaders(accessToken), responseType: 'text' }
      )
      return data as unknown as string
    } catch {
      return null
    }
  }

  private async getRepoFileTree(accessToken: string, repoFullName: string, branch: string): Promise<string[]> {
    try {
      const { data } = await axios.get(
        `${BITBUCKET_API_BASE}/repositories/${repoFullName}/src/${branch}/?max_depth=10&pagelen=100`,
        { headers: this.getHeaders(accessToken) }
      )
      return (data.values ?? [])
        .filter((item: any) => item.type === 'commit_file')
        .map((item: any) => item.path as string)
        .slice(0, 300)
    } catch (error) {
      logger.warn({ repoFullName }, 'Could not fetch Bitbucket repo file tree')
      return []
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

  // ── Agent tool-facing methods (additive — reuse the existing private helpers above) ──

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

export const bitbucketService = new BitbucketService()
