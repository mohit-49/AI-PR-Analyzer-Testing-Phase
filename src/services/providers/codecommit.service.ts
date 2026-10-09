// import {
//   CodeCommitClient,
//   GetPullRequestCommand,
//   GetDifferencesCommand,
//   GetFileCommand,
//   GetFolderCommand,
//   ListRepositoriesCommand,
//   GetRepositoryCommand,
//   MergePullRequestByFastForwardCommand,
//   MergePullRequestBySquashCommand,
//   MergePullRequestByThreeWayCommand,
//   UpdatePullRequestStatusCommand,
// } from '@aws-sdk/client-codecommit'
// import { diffLines, createTwoFilesPatch } from 'diff'
// import { env } from '../../config/env'
// import { IGitProviderService, ProviderPRData, ProviderChangedFile, ProviderRepoSummary } from './git-provider.interface'
// import { logger } from '../../lib/logger'

// const client = new CodeCommitClient({
//   region: env.AWS_REGION,
//   credentials: {
//     accessKeyId: env.AWS_ACCESS_KEY_ID!,
//     secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
//   },
// })

// export class CodeCommitService implements IGitProviderService {

// async getPullRequest(_accessToken: string, repoFullName: string, prNumber: number): Promise<ProviderPRData> {
//   const result = await client.send(new GetPullRequestCommand({ pullRequestId: String(prNumber) }))
//   const target = result.pullRequest?.pullRequestTargets?.[0]

//   return {
//     title: result.pullRequest?.title ?? '',
//     body: result.pullRequest?.description ?? '',
//     user: { login: this.extractReadableAuthor(result.pullRequest?.authorArn) },
//     base: { ref: target?.destinationReference ?? '' },
//     head: { ref: target?.sourceReference ?? '' },
//     html_url: `https://console.aws.amazon.com/codesuite/codecommit/repositories/${repoFullName}/pull-requests/${prNumber}`,
//     state: result.pullRequest?.pullRequestStatus ?? 'OPEN',
//   }
// }

// private extractReadableAuthor(arn?: string): string {
//   if (!arn) return 'unknown'
//   const parts = arn.split('/')
//   return parts[parts.length - 1] || arn
// }
//  async getPRFiles(_accessToken: string, repoFullName: string, prNumber: number): Promise<ProviderChangedFile[]> {
//     const prResult = await client.send(new GetPullRequestCommand({ pullRequestId: String(prNumber) }))
//     const target = prResult.pullRequest?.pullRequestTargets?.[0]

//     const diffResult = await client.send(
//       new GetDifferencesCommand({
//         repositoryName: repoFullName,
//         beforeCommitSpecifier: target?.destinationCommit,
//         afterCommitSpecifier: target?.sourceCommit,
//       })
//     )

//     // CodeCommit gives before/after blob refs, not a ready diff string like GitHub —
//     // `patch` stays empty here; ai-analyzer.service.ts's fullContent block (already
//     // built for the "read full file" bug-catch feature) becomes the primary signal
//     // for CodeCommit-sourced PRs instead of a unified diff.
//     return (diffResult.differences ?? []).map((d) => ({
//       filename: d.afterBlob?.path ?? d.beforeBlob?.path ?? '',
//       status: (d.changeType === 'A' ? 'added' : d.changeType === 'D' ? 'deleted' : 'modified') as
//         | 'added'
//         | 'modified'
//         | 'deleted',
//       additions: 0, // CodeCommit doesn't provide line-level stats directly — would need a diff lib on blob contents to compute
//       deletions: 0,
//       patch: '',
//     }))
//   }

//   async readFile(_accessToken: string, repoFullName: string, branch: string, filePath: string): Promise<string | null> {
//     try {
//       const result = await client.send(
//         new GetFileCommand({ repositoryName: repoFullName, commitSpecifier: branch, filePath })
//       )
//       return result.fileContent ? Buffer.from(result.fileContent).toString('utf-8') : null
//     } catch (error) {
//       logger.warn({ repoFullName, filePath, error: (error as Error)?.message }, 'CodeCommit readFile failed')
//       return null
//     }
//   }

//   async getUserRepos(_accessToken: string): Promise<ProviderRepoSummary[]> {
//   const result = await client.send(new ListRepositoriesCommand({}))
//   const repos = await Promise.all(
//     (result.repositories ?? []).map(async (r) => {
//       const detail = await client.send(new GetRepositoryCommand({ repositoryName: r.repositoryName }))
//       return {
//         id: detail.repositoryMetadata?.repositoryId ?? r.repositoryId ?? '',
//         full_name: r.repositoryName ?? '',
//         default_branch: detail.repositoryMetadata?.defaultBranch ?? 'main',
//         private: true, // CodeCommit repos are always private to the AWS account — no public option
//       }
//     })
//   )
//   return repos
// }

// async getRepo(_accessToken: string, repoFullName: string): Promise<ProviderRepoSummary> {
//   const detail = await client.send(new GetRepositoryCommand({ repositoryName: repoFullName }))
//   return {
//     id: detail.repositoryMetadata?.repositoryId ?? '',
//     full_name: repoFullName,
//     default_branch: detail.repositoryMetadata?.defaultBranch ?? 'main',
//     private: true,
//   }
// }

// // CodeCommit has no per-repo webhook concept — event delivery is account-wide via an
// // EventBridge Rule (set up once, in infra, not per repo-connect). This is a no-op that
// // returns a placeholder id so the shared "connect repository" flow doesn't break; the
// // real routing is EventBridge → SNS → Lambda → /api/webhooks/codecommit, configured
// // outside the app.
// async registerWebhook(
//   _accessToken: string,
//   repoFullName: string,
//   _webhookUrl: string,
//   _webhookSecret: string
// ): Promise<string> {
//   logger.info({ repoFullName }, 'CodeCommit uses an account-wide EventBridge rule — no per-repo webhook to register')
//   return 'codecommit-eventbridge-managed'
// }

// async deleteWebhook(_accessToken: string, repoFullName: string, _webhookId: string): Promise<void> {
//   logger.info({ repoFullName }, 'CodeCommit uses an account-wide EventBridge rule — nothing to delete per repo')
// }

// async mergePullRequest(
//   _accessToken: string,
//   repoFullName: string,
//   prNumber: number,
//   mergeMethod: string
// ): Promise<void> {
//   const pullRequestId = String(prNumber)

//   if (mergeMethod === 'squash') {
//     await client.send(new MergePullRequestBySquashCommand({ pullRequestId, repositoryName: repoFullName }))
//   } else if (mergeMethod === 'rebase') {
//     // CodeCommit has no rebase-merge equivalent (only FAST_FORWARD / SQUASH / THREE_WAY) —
//     // three-way is the closest fallback; log it so this isn't a silent behavior change.
//     logger.warn({ repoFullName, prNumber }, 'CodeCommit has no rebase merge — falling back to three-way merge')
//     await client.send(new MergePullRequestByThreeWayCommand({ pullRequestId, repositoryName: repoFullName }))
//   } else {
//     await client.send(new MergePullRequestByFastForwardCommand({ pullRequestId, repositoryName: repoFullName }))
//   }
// }

// async declinePullRequest(_accessToken: string, _repoFullName: string, prNumber: number, reason?: string): Promise<void> {
//   await client.send(
//     new UpdatePullRequestStatusCommand({ pullRequestId: String(prNumber), pullRequestStatus: 'CLOSED' })
//   )
//   if (reason) logger.info({ prNumber, reason }, 'CodeCommit PR declined')
// }

//   async listDirectory(_accessToken: string, repoFullName: string, branch: string, dirPath: string) {
//     const result = await client.send(
//       new GetFolderCommand({ repositoryName: repoFullName, commitSpecifier: branch, folderPath: dirPath || '/' })
//     )
//     const files = (result.files ?? []).map((f) => ({ path: f.relativePath ?? '', type: 'file' as const }))
//     const dirs = (result.subFolders ?? []).map((d) => ({ path: d.relativePath ?? '', type: 'dir' as const }))
//     return [...dirs, ...files]
//   }

//   async getRepoContext(accessToken: string, repoFullName: string, branch: string) {
//     const [packageJson, readme] = await Promise.all([
//       this.readFile(accessToken, repoFullName, branch, 'package.json'),
//       this.readFile(accessToken, repoFullName, branch, 'README.md'),
//     ])
//     // Full recursive tree needs a manual walk (GetFolder is one level at a time) —
//     // start with root-level only; can be made recursive later if needed.
//     const rootEntries = await this.listDirectory(accessToken, repoFullName, branch, '')
//     return {
//       fileTree: rootEntries.map((e) => e.path),
//       packageJson,
//       readme,
//     }
//   }

// }

// export const codecommitService = new CodeCommitService()













// **************************************************************************************************





import {
  CodeCommitClient,
  GetPullRequestCommand,
  GetDifferencesCommand,
  GetFileCommand,
  GetFolderCommand,
  GetBranchCommand,
  GetCommitCommand,
  ListRepositoriesCommand,
  GetRepositoryCommand,
  MergePullRequestByFastForwardCommand,
  MergePullRequestBySquashCommand,
  MergePullRequestByThreeWayCommand,
  UpdatePullRequestStatusCommand,
} from '@aws-sdk/client-codecommit'
import { diffLines, createTwoFilesPatch } from 'diff'
import { env } from '../../config/env'
import {
  IGitProviderService,
  ProviderPRData,
  ProviderChangedFile,
  ProviderRepoSummary,
  ProviderCommit,
  ProviderCommitsResult,
} from './git-provider.interface'
import { logger } from '../../lib/logger'

const client = new CodeCommitClient({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
  },
})

export class CodeCommitService implements IGitProviderService {

async getPullRequest(_accessToken: string, repoFullName: string, prNumber: number): Promise<ProviderPRData> {
  const result = await client.send(new GetPullRequestCommand({ pullRequestId: String(prNumber) }))
  const target = result.pullRequest?.pullRequestTargets?.[0]

  return {
    title: result.pullRequest?.title ?? '',
    body: result.pullRequest?.description ?? '',
    user: { login: this.extractReadableAuthor(result.pullRequest?.authorArn) },
    base: { ref: target?.destinationReference ?? '' },
    head: { ref: target?.sourceReference ?? '' },
    html_url: `https://console.aws.amazon.com/codesuite/codecommit/repositories/${repoFullName}/pull-requests/${prNumber}`,
    state: result.pullRequest?.pullRequestStatus ?? 'OPEN',
  }
}

private extractReadableAuthor(arn?: string): string {
  if (!arn) return 'unknown'
  const parts = arn.split('/')
  return parts[parts.length - 1] || arn
}
 async getPRFiles(_accessToken: string, repoFullName: string, prNumber: number): Promise<ProviderChangedFile[]> {
    const prResult = await client.send(new GetPullRequestCommand({ pullRequestId: String(prNumber) }))
    const target = prResult.pullRequest?.pullRequestTargets?.[0]

    const diffResult = await client.send(
      new GetDifferencesCommand({
        repositoryName: repoFullName,
        beforeCommitSpecifier: target?.destinationCommit,
        afterCommitSpecifier: target?.sourceCommit,
      })
    )

    // CodeCommit gives before/after blob refs, not a ready diff string like GitHub —
    // `patch` stays empty here; ai-analyzer.service.ts's fullContent block (already
    // built for the "read full file" bug-catch feature) becomes the primary signal
    // for CodeCommit-sourced PRs instead of a unified diff.
    return (diffResult.differences ?? []).map((d) => ({
      filename: d.afterBlob?.path ?? d.beforeBlob?.path ?? '',
      status: (d.changeType === 'A' ? 'added' : d.changeType === 'D' ? 'deleted' : 'modified') as
        | 'added'
        | 'modified'
        | 'deleted',
      additions: 0, // CodeCommit doesn't provide line-level stats directly — would need a diff lib on blob contents to compute
      deletions: 0,
      patch: '',
    }))
  }

  async readFile(_accessToken: string, repoFullName: string, branch: string, filePath: string): Promise<string | null> {
    try {
      const result = await client.send(
        new GetFileCommand({ repositoryName: repoFullName, commitSpecifier: branch, filePath })
      )
      return result.fileContent ? Buffer.from(result.fileContent).toString('utf-8') : null
    } catch (error) {
      logger.warn({ repoFullName, filePath, error: (error as Error)?.message }, 'CodeCommit readFile failed')
      return null
    }
  }

  async getUserRepos(_accessToken: string): Promise<ProviderRepoSummary[]> {
  const result = await client.send(new ListRepositoriesCommand({}))
  const repos = await Promise.all(
    (result.repositories ?? []).map(async (r) => {
      const detail = await client.send(new GetRepositoryCommand({ repositoryName: r.repositoryName }))
      return {
        id: detail.repositoryMetadata?.repositoryId ?? r.repositoryId ?? '',
        full_name: r.repositoryName ?? '',
        default_branch: detail.repositoryMetadata?.defaultBranch ?? 'main',
        private: true, // CodeCommit repos are always private to the AWS account — no public option
      }
    })
  )
  return repos
}

async getRepo(_accessToken: string, repoFullName: string): Promise<ProviderRepoSummary> {
  const detail = await client.send(new GetRepositoryCommand({ repositoryName: repoFullName }))
  return {
    id: detail.repositoryMetadata?.repositoryId ?? '',
    full_name: repoFullName,
    default_branch: detail.repositoryMetadata?.defaultBranch ?? 'main',
    private: true,
  }
}

// CodeCommit has no per-repo webhook concept — event delivery is account-wide via an
// EventBridge Rule (set up once, in infra, not per repo-connect). This is a no-op that
// returns a placeholder id so the shared "connect repository" flow doesn't break; the
// real routing is EventBridge → SNS → Lambda → /api/webhooks/codecommit, configured
// outside the app.
async registerWebhook(
  _accessToken: string,
  repoFullName: string,
  _webhookUrl: string,
  _webhookSecret: string
): Promise<string> {
  logger.info({ repoFullName }, 'CodeCommit uses an account-wide EventBridge rule — no per-repo webhook to register')
  return 'codecommit-eventbridge-managed'
}

async deleteWebhook(_accessToken: string, repoFullName: string, _webhookId: string): Promise<void> {
  logger.info({ repoFullName }, 'CodeCommit uses an account-wide EventBridge rule — nothing to delete per repo')
}

async mergePullRequest(
  _accessToken: string,
  repoFullName: string,
  prNumber: number,
  mergeMethod: string
): Promise<void> {
  const pullRequestId = String(prNumber)

  if (mergeMethod === 'squash') {
    await client.send(new MergePullRequestBySquashCommand({ pullRequestId, repositoryName: repoFullName }))
  } else if (mergeMethod === 'rebase') {
    // CodeCommit has no rebase-merge equivalent (only FAST_FORWARD / SQUASH / THREE_WAY) —
    // three-way is the closest fallback; log it so this isn't a silent behavior change.
    logger.warn({ repoFullName, prNumber }, 'CodeCommit has no rebase merge — falling back to three-way merge')
    await client.send(new MergePullRequestByThreeWayCommand({ pullRequestId, repositoryName: repoFullName }))
  } else {
    await client.send(new MergePullRequestByFastForwardCommand({ pullRequestId, repositoryName: repoFullName }))
  }
}

async declinePullRequest(_accessToken: string, _repoFullName: string, prNumber: number, reason?: string): Promise<void> {
  await client.send(
    new UpdatePullRequestStatusCommand({ pullRequestId: String(prNumber), pullRequestStatus: 'CLOSED' })
  )
  if (reason) logger.info({ prNumber, reason }, 'CodeCommit PR declined')
}

  // CodeCommit has no ListCommits API — the only way to walk history is one
  // parent-hop at a time via GetCommit, starting from the branch tip.
  private async getCommitChain(repoFullName: string, startSha: string, limit: number): Promise<any[]> {
    const commits: any[] = []
    let currentSha: string | undefined = startSha

    while (currentSha && commits.length < limit) {
      const result: any = await client.send(
        new GetCommitCommand({ repositoryName: repoFullName, commitId: currentSha })
      )
      if (!result.commit) break
      commits.push(result.commit)
      currentSha = result.commit.parents?.[0]
    }

    return commits
  }

  async getCommits(
    _accessToken: string,
    repoFullName: string,
    branch: string,
    page: number,
    perPage: number
  ): Promise<ProviderCommitsResult> {
    const branchResult = await client.send(new GetBranchCommand({ repositoryName: repoFullName, branchName: branch }))
    const tipSha = branchResult.branch?.commitId

    if (!tipSha) {
      return { commits: [], page, perPage, hasMore: false, totalCount: 0, totalIsApproximate: false }
    }

    // We walk (page * perPage) + 1 commits from the tip and slice out the
    // requested page. This costs O(page*perPage) GetCommit calls, so it gets
    // more expensive on deep pages — a HARD_CAP protects against a runaway
    // request on a huge repo / large page number.
    const HARD_CAP = 500
    const needed = Math.min(page * perPage + 1, HARD_CAP)
    const chain = await this.getCommitChain(repoFullName, tipSha, needed)

    const start = (page - 1) * perPage
    const pageSlice = chain.slice(start, start + perPage)
    const hasMore = chain.length > start + perPage

    const commits: ProviderCommit[] = pageSlice.map((c: any) => ({
      sha: c.commitId,
      message: c.message ?? '',
      author: {
        name: c.author?.name ?? 'Unknown',
        email: c.author?.email,
      },
      date: c.author?.date ?? c.committer?.date ?? '',
      url: `https://console.aws.amazon.com/codesuite/codecommit/repositories/${repoFullName}/commit/${c.commitId}`,
    }))

    // A true total would mean walking the entire history — not done here to
    // avoid unbounded GetCommit calls, so this stays null/approximate.
    return { commits, page, perPage, hasMore, totalCount: null, totalIsApproximate: true }
  }

  async listDirectory(_accessToken: string, repoFullName: string, branch: string, dirPath: string) {
    const result = await client.send(
      new GetFolderCommand({ repositoryName: repoFullName, commitSpecifier: branch, folderPath: dirPath || '/' })
    )
    const files = (result.files ?? []).map((f) => ({ path: f.relativePath ?? '', type: 'file' as const }))
    const dirs = (result.subFolders ?? []).map((d) => ({ path: d.relativePath ?? '', type: 'dir' as const }))
    return [...dirs, ...files]
  }

  async getRepoContext(accessToken: string, repoFullName: string, branch: string) {
    const [packageJson, readme] = await Promise.all([
      this.readFile(accessToken, repoFullName, branch, 'package.json'),
      this.readFile(accessToken, repoFullName, branch, 'README.md'),
    ])
    // Full recursive tree needs a manual walk (GetFolder is one level at a time) —
    // start with root-level only; can be made recursive later if needed.
    const rootEntries = await this.listDirectory(accessToken, repoFullName, branch, '')
    return {
      fileTree: rootEntries.map((e) => e.path),
      packageJson,
      readme,
    }
  }

}

export const codecommitService = new CodeCommitService()