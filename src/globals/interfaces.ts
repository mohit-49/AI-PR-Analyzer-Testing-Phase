import { Types } from 'mongoose'
import { PRStatus, AnalysisStatus, RiskLevel, BillingPlan, BillingAction, GitProvider, SkillStatus, FeedbackType, FeedbackStatus } from './enums'

export interface IUser {
  _id: Types.ObjectId

  role: 'user' | 'admin'
  passwordHash?: string
  isActive: Boolean
  email: string
  name: string
  avatarUrl: string
  customAvatarUrl?: string
  bio?: string

  bitbucketAvatarUrl?: string
  lastLoginProvider?: 'github' | 'bitbucket'
  bitbucketProfile?: {
    fullName?: string
    publicName?: string
    jobTitle?: string
    department?: string
    organization?: string
    basedIn?: string
    localTime?: string
    workingWithYou?: string
  }

  gitlabAccessToken?: string
  gitlabId?: string
  gitlabRefreshToken?: string
  gitlabTokenExpiresAt?: Date
  gitlabAvatarUrl?: string

  company?: string
  location?: string
  blog?: string
  githubId?: string
  githubAccessToken?: string
  bitbucketId?: string
  bitbucketAccessToken?: string
  bitbucketRefreshToken?: string
  bitbucketTokenExpiresAt?: Date
  plan: BillingPlan
  tokenUsage: {
    used: number
    limit: number
    resetAt: Date
  }
  connectedProviders: GitProvider[]
  createdAt: Date
  updatedAt: Date
}

export interface IRepository {
  _id: Types.ObjectId
  userId: Types.ObjectId
  provider: GitProvider
  repoId: string
  fullName: string
  defaultBranch: string
  webhookId: string
  webhookSecret: string
  isActive: boolean
  isPrivate?: boolean
  monitorConfig: {
    watchPRs: boolean
    watchCommits: boolean
    watchReleases: boolean
    watchDocs: boolean
    watchIssues: boolean
  }
  createdAt: Date
  updatedAt: Date
}

export interface IChangedFile {
  filename: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  additions: number
  deletions: number
  patch?: string
  fullContent?: string | null
}

export interface IPullRequest {
  _id: Types.ObjectId
  repositoryId: Types.ObjectId
  userId: Types.ObjectId
  prNumber: number
  title: string
  description: string
  author: string
  baseBranch: string
  headBranch: string
  changedFiles: IChangedFile[]
  status: PRStatus
  analysisStatus: AnalysisStatus
  githubPrId: number
  githubUrl: string
  mergedAt?: Date
  mergedBy?: Types.ObjectId
  mergeMethod?: 'merge' | 'squash' | 'rebase'
  declinedAt?: Date
  declinedBy?: Types.ObjectId
  declineReason?: string
  createdAt: Date
  updatedAt: Date
  repositoryFullName: string
  plan: BillingPlan
  provider: GitProvider
   seenAt: Date
}

export interface ITestingSuggestion {
  area: string
  suggestion: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
}

export interface IReviewComment {
  file: string
  line?: number
  comment: string
  severity: 'INFO' | 'WARNING' | 'ERROR'
}

export interface IAnalysis {
  _id: Types.ObjectId
  pullRequestId: Types.ObjectId
  userId: Types.ObjectId
  summary: string
  riskLevel: RiskLevel
  riskScore: number
  riskReasons: string[]
  testingSuggestions: ITestingSuggestion[]
  reviewComments: IReviewComment[]
  aiModel: 'gpt-4o' | 'claude-sonnet'
  tokensUsed: number
  processingTimeMs: number
  createdAt: Date
  mergeVerdict: 'READY' | 'NEEDS_CHANGES' | 'NEEDS_DISCUSSION'
  securityFindings: {
    file: string
    issue: string
    severity: 'HIGH' | 'MEDIUM' | 'LOW'
  }[]
  breakingChanges: string[]
  testCoverageGap: {
    hasGap: boolean
    note: string
  }
  analysisCoverage: {
    isPartial: boolean
    totalFilesChanged: number
    filesAnalyzed: number
    filesTruncated: number
  }
}

export interface IBillingUsage {
  _id: Types.ObjectId
  userId: Types.ObjectId
  action: BillingAction
  tokensUsed: number
  cost: number
  prId?: Types.ObjectId
  repositoryId?: Types.ObjectId
  createdAt: Date

  inputTokens?: number
  outputTokens?: number
  aiModel?: string
  llmProvider?: string
}

export interface JwtPayload {
  userId: string
  plan: BillingPlan
}

export interface IRepoSkill {
  _id: Types.ObjectId
  repositoryId: Types.ObjectId
  userId: Types.ObjectId
  status: SkillStatus
  isActive: boolean
  source: 'ai_generated' | 'uploaded'
  fileName?: string
  rawMarkdown?: string
  techStack: string[]
  conventions: string[]
  summary: string
  reviewFocusAreas: string[]
  rawModelOutput?: string
  errorMessage?: string
  aiModel: string
  tokensUsed: number
  generatedAt?: Date
  lastEditedBy: 'ai' | 'user'
  lastEditedAt?: Date
  generationMethod?: 'single_shot' | 'agent'
  agentSteps?: string[]
  createdAt: Date
  updatedAt: Date
}





export interface IFeedbackStatusEntry {
  status: FeedbackStatus
  note?: string
  changedBy?: Types.ObjectId
  changedAt: Date
}
export interface IFeedback {
  _id: Types.ObjectId
  userId: Types.ObjectId
  type: FeedbackType
  title: string
  description: string
  screenshots?: string[]
  status: FeedbackStatus
  statusHistory: IFeedbackStatusEntry[]
  createdAt: Date
  updatedAt: Date
}