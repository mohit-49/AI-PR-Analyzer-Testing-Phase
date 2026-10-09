import { Request, Response, NextFunction } from 'express'
import { RepositoryModel } from '../models/Repository.model'
import { GitProvider } from '../globals/enums'
import { UnauthorizedError } from '../lib/errors'
import { logger } from '../lib/logger'

export const gitlabWebhookVerify = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = req.headers['x-gitlab-token'] as string | undefined
    const repoFullName = req.body?.project?.path_with_namespace

    if (!token || !repoFullName) {
      throw new UnauthorizedError('Missing GitLab webhook token or repository identifier')
    }

    const repository = await RepositoryModel.findOne({
      provider: GitProvider.GITLAB,
      fullName: repoFullName,
      isActive: true,
    })
    if (!repository) {
      logger.warn({ repoFullName }, 'GitLab webhook — no matching connected repository')
      res.status(200).json({ success: true, message: 'Repository not connected — ignored' })
      return
    }

    if (!repository.webhookSecret || token !== repository.webhookSecret) {
      logger.warn({ repoFullName }, 'GitLab webhook — token mismatch')
      throw new UnauthorizedError('Invalid webhook token')
    }

    ; (req as any).matchedRepository = repository
    next()
  } catch (error) {
    next(error)
  }
}