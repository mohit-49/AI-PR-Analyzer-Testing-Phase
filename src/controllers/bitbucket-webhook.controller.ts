import { Request, Response, NextFunction } from 'express'
import crypto from 'crypto'
import { RepositoryModel } from '../models/Repository.model'
import { PullRequestModel } from '../models/PullRequest.model'
import { prAnalysisQueue } from '../queues/pr-analysis.queue'
import { PRStatus, AnalysisStatus, GitProvider } from '../globals/enums'
import { logger } from '../lib/logger'

export class BitbucketWebhookController {
  async handleBitbucket(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const eventKey = req.headers['x-event-key'] as string
      const signature = req.headers['x-hub-signature'] as string | undefined
      const payload = req.body

      if (!eventKey?.startsWith('pullrequest:')) {
        res.json({ success: true, data: { message: 'Event ignored' } })
        return
      }

      const prData = payload.pullrequest
      const repoUuid = payload.repository?.uuid

      const repository = await RepositoryModel.findOne({
        repoId: repoUuid,
        provider: GitProvider.BITBUCKET,
        isActive: true,
      }).sort({ createdAt: -1 })

      if (!repository) {
        res.json({ success: true, data: { message: 'Repository not tracked' } })
        return
      }

      if (repository.webhookSecret) {
        if (!signature) {
          logger.warn({ repoId: repository._id }, 'Bitbucket webhook missing signature — rejected')
          res.status(401).json({ success: false, error: { code: 'WEBHOOK_UNAUTHORIZED' } })
          return
        }

        const rawBody = (req as any).rawBody as Buffer | undefined
        if (!rawBody) {
          logger.error({ repoId: repository._id }, 'rawBody missing — check express.json verify middleware order')
          res.status(400).json({ success: false, error: { code: 'RAW_BODY_MISSING' } })
          return
        }

        const expected = `sha256=${crypto
          .createHmac('sha256', repository.webhookSecret)
          .update(rawBody)
          .digest('hex')}`

        const isValid =
          signature.length === expected.length &&
          crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))

        if (!isValid) {
          logger.warn({ repoId: repository._id }, 'Invalid Bitbucket webhook signature')
          res.status(401).json({ success: false, error: { code: 'WEBHOOK_UNAUTHORIZED' } })
          return
        }
      }

      logger.info({ eventKey, prNumber: prData.id, repoId: repository._id }, 'Webhook received')

      if (eventKey === 'pullrequest:created' || eventKey === 'pullrequest:updated') {
        const pr = await PullRequestModel.findOneAndUpdate(
          { githubPrId: prData.id, repositoryId: repository._id },
          {
            $set: {
              repositoryId: repository._id,
              userId: repository.userId,
              prNumber: prData.id,
              title: prData.title,
              description: prData.description || '',
              author: prData.author?.display_name ?? prData.author?.nickname ?? 'unknown',
              baseBranch: prData.destination?.branch?.name ?? '',
              headBranch: prData.source?.branch?.name ?? '',
              status: PRStatus.OPEN,
              analysisStatus: AnalysisStatus.QUEUED,
              githubPrId: prData.id,
              githubUrl: prData.links?.html?.href ?? '',
            },
          },
          { upsert: true, new: true }
        )

        await prAnalysisQueue.add('analyze-pr', {
          pullRequestId: pr._id.toString(),
          repositoryId: repository._id.toString(),
          userId: repository.userId.toString(),
          prNumber: prData.id,
          githubRepoFullName: payload.repository.full_name,
          provider: GitProvider.BITBUCKET,
        })

        logger.info({ prId: pr._id, prNumber: prData.id }, 'PR analysis queued')
      }

      if (eventKey === 'pullrequest:fulfilled') {
        await PullRequestModel.findOneAndUpdate(
          { githubPrId: prData.id },
          { status: PRStatus.MERGED, mergedAt: new Date() }
        )
        logger.info({ prNumber: prData.id }, 'PR marked as merged')
      }

      if (eventKey === 'pullrequest:rejected') {
        await PullRequestModel.findOneAndUpdate(
          { githubPrId: prData.id },
          { status: PRStatus.DECLINED, declinedAt: new Date() }
        )
        logger.info({ prNumber: prData.id }, 'PR marked as declined')
      }

      res.json({ success: true, data: { received: true } })
    } catch (error) {
      next(error)
    }
  }
}

export const bitbucketWebhookController = new BitbucketWebhookController()
