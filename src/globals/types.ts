import { Request } from 'express'
import { JwtPayload } from './interfaces'
import { GitProvider } from './enums'

export type AuthenticatedRequest = Request & {
  user: JwtPayload
}

export type ApiResponse<T> = {
  success: true
  data: T
} | {
  success: false
  error: {
    code: string
    message: string
  }
}

export type PRAnalysisJobData = {
  pullRequestId: string
  repositoryId: string
  userId: string
  prNumber: number
  githubRepoFullName: string
  installationId?: number
  provider?: GitProvider
}

export type DocumentationJobData = {
  pullRequestId: string
  repositoryId: string
  userId: string
  mergedBranch: string
}

export type SkillGenerationJobData = {
  repositoryId: string
  userId: string
  githubRepoFullName: string
  defaultBranch: string
  provider?: GitProvider
  skillId?: string
}
