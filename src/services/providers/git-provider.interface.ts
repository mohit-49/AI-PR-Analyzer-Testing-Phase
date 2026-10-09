// export interface ProviderPRData {
//   title: string
//   body: string
//   user: { login: string }
//   base: { ref: string }
//   head: { ref: string }
//   html_url: string
//   state: string
// }

// export interface ProviderChangedFile {
//   filename: string
//   status: 'added' | 'modified' | 'deleted' | 'renamed'
//   additions: number
//   deletions: number
//   patch?: string
// }

// export interface ProviderRepoSummary {
//   id: string
//   full_name: string
//   default_branch: string
//   private: boolean
// }

// export interface IGitProviderService {
//   getUserRepos(accessToken: string): Promise<ProviderRepoSummary[]>

//   getRepo(accessToken: string, repoFullName: string): Promise<ProviderRepoSummary>

//   registerWebhook(
//     accessToken: string,
//     repoFullName: string,
//     webhookUrl: string,
//     webhookSecret: string
//   ): Promise<string>

//   mergePullRequest(
//     accessToken: string,
//     repoFullName: string,
//     prNumber: number,
//     mergeMethod: string
//   ): Promise<void>

//   declinePullRequest(
//     accessToken: string,
//     repoFullName: string,
//     prNumber: number,
//     reason?: string
//   ): Promise<void>


//   deleteWebhook(accessToken: string, repoFullName: string, webhookId: string): Promise<void>

//   getPullRequest(accessToken: string, repoFullName: string, prNumber: number): Promise<ProviderPRData>

//   getPRFiles(accessToken: string, repoFullName: string, prNumber: number): Promise<ProviderChangedFile[]>

//   getRepoContext(
//     accessToken: string,
//     repoFullName: string,
//     branch: string
//   ): Promise<{ fileTree: string[]; packageJson: string | null; readme: string | null }>

//   listDirectory(
//     accessToken: string,
//     repoFullName: string,
//     branch: string,
//     dirPath: string
//   ): Promise<{ path: string; type: 'file' | 'dir' }[]>

//   readFile(
//     accessToken: string,
//     repoFullName: string,
//     branch: string,
//     filePath: string
//   ): Promise<string | null>
// }







export interface ProviderPRData {
  title: string
  body: string
  user: { login: string }
  base: { ref: string }
  head: { ref: string }
  html_url: string
  state: string
}

export interface ProviderChangedFile {
  filename: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  additions: number
  deletions: number
  patch?: string
}

export interface ProviderRepoSummary {
  id: string
  full_name: string
  default_branch: string
  private: boolean
}

export interface ProviderCommitAuthor {
  name: string
  email?: string
  login?: string
  avatarUrl?: string
}

export interface ProviderCommit {
  sha: string
  message: string
  author: ProviderCommitAuthor
  date: string
  url: string
}

export interface ProviderCommitsResult {
  commits: ProviderCommit[]
  page: number
  perPage: number
  hasMore: boolean
  // Exact total when the provider can give us one cheaply, otherwise null.
  totalCount: number | null
  // true when totalCount is an estimate / unavailable and the UI should say "~"
  totalIsApproximate: boolean
}

export interface IGitProviderService {
  getUserRepos(accessToken: string): Promise<ProviderRepoSummary[]>

  getRepo(accessToken: string, repoFullName: string): Promise<ProviderRepoSummary>

  getCommits(
    accessToken: string,
    repoFullName: string,
    branch: string,
    page: number,
    perPage: number
  ): Promise<ProviderCommitsResult>

  registerWebhook(
    accessToken: string,
    repoFullName: string,
    webhookUrl: string,
    webhookSecret: string
  ): Promise<string>

  mergePullRequest(
    accessToken: string,
    repoFullName: string,
    prNumber: number,
    mergeMethod: string
  ): Promise<void>

  declinePullRequest(
    accessToken: string,
    repoFullName: string,
    prNumber: number,
    reason?: string
  ): Promise<void>


  deleteWebhook(accessToken: string, repoFullName: string, webhookId: string): Promise<void>

  getPullRequest(accessToken: string, repoFullName: string, prNumber: number): Promise<ProviderPRData>

  getPRFiles(accessToken: string, repoFullName: string, prNumber: number): Promise<ProviderChangedFile[]>

  getRepoContext(
    accessToken: string,
    repoFullName: string,
    branch: string
  ): Promise<{ fileTree: string[]; packageJson: string | null; readme: string | null }>

  listDirectory(
    accessToken: string,
    repoFullName: string,
    branch: string,
    dirPath: string
  ): Promise<{ path: string; type: 'file' | 'dir' }[]>

  readFile(
    accessToken: string,
    repoFullName: string,
    branch: string,
    filePath: string
  ): Promise<string | null>
}
