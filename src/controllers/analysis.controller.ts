import { Response, NextFunction } from 'express'
import { AnalysisModel } from '../models/Analysis.model'
import { PullRequestModel } from '../models/PullRequest.model'
import { RepositoryModel } from '../models/Repository.model'
import { AuthenticatedRequest } from '../globals/types'
import { NotFoundError } from '../lib/errors'
import { UserModel } from '../models/User.model'
import { getProviderService } from '../services/providers/provider-factory'
import { getDecryptedTokenForProvider } from '../utils/provider-token.util'
import { getValidBitbucketAccessToken } from '../services/providers/bitbucket-refresh-token/bitbucket-token.service'
import { GitProvider, PRStatus } from '../globals/enums'
import { AppError, ValidationError } from '../lib/errors'
import { logger } from '../lib/logger'
import { z } from 'zod'
import { Types } from 'mongoose'
import { getProviderPRCounts } from '@/services/providers/prcount/pr-count.util'
import { listProviderPRs } from '@/services/providers/prcount/pr-list.util'

const MergePRSchema = z.object({
  mergeMethod: z.enum(['merge', 'squash', 'rebase']).default('merge'),
})

const DeclinePRSchema = z.object({
  reason: z.string().max(1000).optional(),
})

const MarkSeenSchema = z.object({
  prIds: z.array(z.string()).min(1).max(200),
})

function mapMergeMethod(provider: GitProvider, method: 'merge' | 'squash' | 'rebase'): string {
  if (provider === GitProvider.BITBUCKET) {
    const map: Record<string, string> = { merge: 'merge_commit', squash: 'squash', rebase: 'fast_forward' }
    return map[method] ?? 'merge_commit'
  }
  if (provider === GitProvider.GITLAB) {
    const map: Record<string, string> = { merge: 'merge', squash: 'squash', rebase: 'merge' }
    return map[method] ?? 'merge'
  }
  return method
}

export class AnalysisController {

  // GET /api/analysis/pr/:prId
  async getByPR(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const pr = await PullRequestModel.findOne({
        _id: req.params.prId,
        userId: req.user!.userId
      })
      if (!pr) throw new NotFoundError('Pull request not found')

      const analysis = await AnalysisModel.findOne({ pullRequestId: pr._id }).sort({ createdAt: -1 })

      res.status(200).json({
        success: true,
        status: 200,
        message: 'Specific PR fetch successfully.',
        data: { analysis, pr }
      })
    } catch (error) {
      next(error)
    }
  }

  async listAll(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 1000
      const skip = (page - 1) * limit

      const repos = await RepositoryModel.find({ userId: req.user!.userId, isActive: true }).select(
        'fullName provider'
      )
      const repoMap = Object.fromEntries(repos.map((r) => [r._id.toString(), r]))
      const repoIds = repos.map((r) => r._id)

      const [prs, total] = await Promise.all([
        PullRequestModel.find({ userId: req.user!.userId, repositoryId: { $in: repoIds } })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        PullRequestModel.countDocuments({ userId: req.user!.userId, repositoryId: { $in: repoIds } }),
      ])

      const prIds = prs.map((pr) => pr._id)
      const analyses = await AnalysisModel.find({ pullRequestId: { $in: prIds } })
      const analysisMap = Object.fromEntries(analyses.map((a) => [a.pullRequestId.toString(), a]))

      const result = prs.map((pr) => ({
        pr,
        analysis: analysisMap[pr._id.toString()] || null,
        repo: repoMap[pr.repositoryId.toString()] ?? null,
      }))

      res.status(200).json({
        success: true,
        status: 200,
        message: 'All PRs completed data fetch successfully.',
        data: { items: result, page, limit, total }
      })
    } catch (error) {
      next(error)
    }
  }

  async listByRepo(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1
      const limit = 20
      const skip = (page - 1) * limit

      const prs = await PullRequestModel.find({
        userId: req.user!.userId,
        repositoryId: req.params.repoId,
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)

      const prIds = prs.map((pr) => pr._id)
      const analyses = await AnalysisModel.find({ pullRequestId: { $in: prIds } })

      const analysisMap = Object.fromEntries(
        analyses.map((a) => [a.pullRequestId.toString(), a])
      )

      const result = prs.map((pr) => ({
        pr,
        analysis: analysisMap[pr._id.toString()] || null,
      }))

      res.status(200).json({
        success: true,
        status: 200,
        message: 'Pull requests retrieved successfully.',
        data: { items: result, page, limit }
      })
    } catch (error) {
      next(error)
    }
  }



  // GET /api/analysis/repository/:repoId/pull-requests?page=1&limit=8
  async listRepoPullRequests(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId
      const page = Math.max(parseInt(req.query.page as string) || 1, 1)
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 8, 1), 50)

      const repository = await RepositoryModel.findOne({ _id: req.params.repoId, userId })
      if (!repository) throw new NotFoundError('Repository not found')

      const analyzed = await PullRequestModel.countDocuments({ userId, repositoryId: repository._id })

      // 1) Provider se asli PR list
      let listed = null
      try {
        const user = await UserModel.findById(userId).select(
          'githubAccessToken bitbucketAccessToken gitlabAccessToken'
        )
        if (!user) throw new NotFoundError('User not found')

        const accessToken =
          repository.provider === GitProvider.BITBUCKET
            ? await getValidBitbucketAccessToken(userId)
            : getDecryptedTokenForProvider(user, repository.provider)

        listed = await listProviderPRs(repository.provider, accessToken, repository.fullName, page, limit)
      } catch (err) {
        logger.warn({ err, repoId: repository._id }, 'Provider PR list failed, using DB fallback')
      }

      // 2) Provider list mili: DB ke analysis ke saath merge
      if (listed) {
        const numbers = listed.items.map((i) => i.number)
        const dbPRs = await PullRequestModel.find({
          userId,
          repositoryId: repository._id,
          prNumber: { $in: numbers },
        })
        const analyses = await AnalysisModel.find({
          pullRequestId: { $in: dbPRs.map((p) => p._id) },
        })

        const prByNumber = Object.fromEntries(dbPRs.map((p) => [p.prNumber, p]))
        const analysisByPR = Object.fromEntries(analyses.map((a) => [a.pullRequestId.toString(), a]))

        const items = listed.items.map((p) => {
          const dbPR = prByNumber[p.number]
          return {
            prId: dbPR?._id ?? null,
            prNumber: p.number,
            title: p.title,
            author: p.author,
            avatar: p.avatar,
            status: p.status,
            url: p.url,
            analysis: dbPR ? analysisByPR[dbPR._id.toString()] ?? null : null,
          }
        })

        res.status(200).json({
          success: true,
          status: 200,
          message: 'Repository pull requests fetched successfully.',
          data: { items, total: listed.total, analyzed, page, limit },
        })
        return
      }

      // 3) Fallback (azure/codecommit ya provider error): sirf DB wali PRs
      const prs = await PullRequestModel.find({ userId, repositoryId: repository._id })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
      const analyses = await AnalysisModel.find({ pullRequestId: { $in: prs.map((p) => p._id) } })
      const analysisByPR = Object.fromEntries(analyses.map((a) => [a.pullRequestId.toString(), a]))

      const items = prs.map((pr: any) => ({
        prId: pr._id,
        prNumber: pr.prNumber,
        title: pr.title,
        author: pr.author,
        avatar: null,
        status: String(pr.status).toLowerCase(),
        url: pr.url ?? null,
        analysis: analysisByPR[pr._id.toString()] ?? null,
      }))

      res.status(200).json({
        success: true,
        status: 200,
        message: 'Repository pull requests fetched successfully.',
        data: { items, total: analyzed, analyzed, page, limit },
      })
    } catch (error) {
      next(error)
    }
  }



  // GET /api/analysis/repository/:repoId/count
  async getRepoPRCount(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId

      const repository = await RepositoryModel.findOne({ _id: req.params.repoId, userId })
      if (!repository) throw new NotFoundError('Repository not found')

      // DB me jitni PRs app me aayi / analyze hui
      const analyzed = await PullRequestModel.countDocuments({
        userId,
        repositoryId: repository._id,
      })

      // Provider par repo ki asli total PRs
      let counts: { total: number; open: number; merged: number; declined: number } | null = null
      try {
        const user = await UserModel.findById(userId).select(
          'githubAccessToken bitbucketAccessToken gitlabAccessToken'
        )
        if (!user) throw new NotFoundError('User not found')

        const accessToken =
          repository.provider === GitProvider.BITBUCKET
            ? await getValidBitbucketAccessToken(userId)
            : getDecryptedTokenForProvider(user, repository.provider)

        counts = await getProviderPRCounts(repository.provider, accessToken, repository.fullName)
      } catch (err) {
        logger.warn({ err, repoId: repository._id }, 'Provider PR count failed')
      }

      // Fallback: provider se na mile (azure/codecommit/error) to DB se count
      if (!counts) {
        const base = { userId, repositoryId: repository._id }
        const [open, merged, declined] = await Promise.all([
          PullRequestModel.countDocuments({ ...base, status: PRStatus.OPEN }),
          PullRequestModel.countDocuments({ ...base, status: PRStatus.MERGED }),
          PullRequestModel.countDocuments({ ...base, status: PRStatus.DECLINED }),
        ])
        counts = { total: analyzed, open, merged, declined }
      }

      res.status(200).json({
        success: true,
        status: 200,
        message: 'Repository PR count fetched successfully.',
        data: {
          analyzed,
          total: counts.total,
          open: counts.open,
          merged: counts.merged,
          declined: counts.declined,
        },
      })
    } catch (error) {
      next(error)
    }
  }

  // POST /api/analysis/pr/:prId/merge
  async mergePR(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = MergePRSchema.safeParse(req.body)
      if (!parsed.success) throw new ValidationError('Invalid merge method')
      const { mergeMethod } = parsed.data

      const pr = await PullRequestModel.findOne({ _id: req.params.prId, userId: req.user!.userId })
      if (!pr) throw new NotFoundError('Pull request not found')
      if (pr.status !== PRStatus.OPEN) {
        throw new AppError('Only open pull requests can be merged', 400, 'INVALID_PR_STATE')
      }

      const repository = await RepositoryModel.findById(pr.repositoryId)
      if (!repository) throw new NotFoundError('Repository not found')

      const user = await UserModel.findById(req.user!.userId).select('githubAccessToken bitbucketAccessToken gitlabAccessToken')
      if (!user) throw new NotFoundError('User not found')

      const accessToken =
        repository.provider === GitProvider.BITBUCKET
          ? await getValidBitbucketAccessToken(req.user!.userId)
          : getDecryptedTokenForProvider(user, repository.provider)

      const providerService = getProviderService(repository.provider)
      const providerMergeMethod = mapMergeMethod(repository.provider, mergeMethod)

      await providerService.mergePullRequest(accessToken, repository.fullName, pr.prNumber, providerMergeMethod)

      pr.status = PRStatus.MERGED
      pr.mergedAt = new Date()
      pr.mergedBy = req.user!.userId as any
      pr.mergeMethod = mergeMethod
      await pr.save()

      logger.info({ prId: pr._id, userId: req.user!.userId, mergeMethod }, 'PR merged via app')

      res.status(200).json({
        success: true,
        status: 200,
        message: 'Pull request merged successfully.',
        data: { pr },
      })
    } catch (error) {
      next(error)
    }
  }

  // POST /api/analysis/pr/:prId/decline
  async declinePR(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = DeclinePRSchema.safeParse(req.body)
      if (!parsed.success) throw new ValidationError('Invalid decline reason')
      const { reason } = parsed.data

      const pr = await PullRequestModel.findOne({ _id: req.params.prId, userId: req.user!.userId })
      if (!pr) throw new NotFoundError('Pull request not found')
      if (pr.status !== PRStatus.OPEN) {
        throw new AppError('Only open pull requests can be declined', 400, 'INVALID_PR_STATE')
      }

      const repository = await RepositoryModel.findById(pr.repositoryId)
      if (!repository) throw new NotFoundError('Repository not found')

      const user = await UserModel.findById(req.user!.userId).select('githubAccessToken bitbucketAccessToken gitlabAccessToken')
      if (!user) throw new NotFoundError('User not found')

      const accessToken =
        repository.provider === GitProvider.BITBUCKET
          ? await getValidBitbucketAccessToken(req.user!.userId)
          : getDecryptedTokenForProvider(user, repository.provider)

      const providerService = getProviderService(repository.provider)
      await providerService.declinePullRequest(accessToken, repository.fullName, pr.prNumber, reason)

      pr.status = PRStatus.DECLINED
      pr.declinedAt = new Date()
      pr.declinedBy = req.user!.userId as any
      pr.declineReason = reason || ''
      await pr.save()

      logger.info({ prId: pr._id, userId: req.user!.userId }, 'PR declined via app')

      res.status(200).json({
        success: true,
        status: 200,
        message: 'Pull request declined successfully.',
        data: { pr },
      })
    } catch (error) {
      next(error)
    }
  }



  // GET /api/analysis/notifications
  async getNotifications(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId

      const repos = await RepositoryModel.find({ userId, isActive: true }).select('fullName provider')
      const repoMap = Object.fromEntries(repos.map((r) => [r._id.toString(), r]))
      const repoIds = repos.map((r) => r._id)

      const filter = {
        userId,
        repositoryId: { $in: repoIds },
        status: PRStatus.OPEN, // sirf open PRs ka notification (chaho to hata sakte ho)
        seenAt: null,
      }

      const [prs, count] = await Promise.all([
        PullRequestModel.find(filter)
          .sort({ createdAt: -1 })
          .limit(10)
          .select(
            'prNumber title repositoryId createdAt author headBranch baseBranch'
          ),
        PullRequestModel.countDocuments(filter),
      ])

      const items = prs.map((pr) => ({
        _id: pr._id,
        prNumber: pr.prNumber,
        title: pr.title,
        author: pr.author,
        headBranch: pr.headBranch,
        baseBranch: pr.baseBranch,
        createdAt: pr.createdAt,
        repoFullName: repoMap[pr.repositoryId.toString()]?.fullName ?? '',
      }))

      res.status(200).json({
        success: true,
        status: 200,
        message: 'Notifications fetched successfully.',
        data: { items, count },
      })
    } catch (error) {
      next(error)
    }
  }

  // POST /api/analysis/notifications/seen   body: { prIds: string[] }
  async markSeen(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = MarkSeenSchema.safeParse(req.body)
      if (!parsed.success) throw new ValidationError('Invalid pull request ids')

      const result = await PullRequestModel.updateMany(
        {
          _id: { $in: parsed.data.prIds },
          userId: req.user!.userId, // sirf apni PRs
          seenAt: null,
        },
        { $set: { seenAt: new Date() } }
      )

      res.status(200).json({
        success: true,
        status: 200,
        message: 'Marked as seen.',
        data: { updated: result.modifiedCount },
      })
    } catch (error) {
      next(error)
    }
  }




  // GET /api/analysis/summary
  async getSummary(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId

      const repositories = await RepositoryModel.find({
        userId,
        isActive: true,
      }).select('_id provider')

      const repositoryIds = repositories.map((repo) => repo._id)

      const [
        totalPRs,
        analysisStatusAgg,
        riskAgg,
        providerAgg,
      ] = await Promise.all([
        PullRequestModel.countDocuments({
          userId,
          repositoryId: { $in: repositoryIds },
        }),

        PullRequestModel.aggregate([
          {
            $match: {
              userId: new Types.ObjectId(userId),
              repositoryId: { $in: repositoryIds },
            },
          },
          {
            $group: {
              _id: '$analysisStatus',
              count: { $sum: 1 },
            },
          },
        ]),

        AnalysisModel.aggregate([
          {
            $match: {
              userId: new Types.ObjectId(userId),
            },
          },
          {
            $group: {
              _id: '$riskLevel',
              count: { $sum: 1 },
            },
          },
        ]),

        PullRequestModel.aggregate([
          {
            $match: {
              userId: new Types.ObjectId(userId),
              repositoryId: { $in: repositoryIds },
            },
          },
          {
            $lookup: {
              from: 'repositories',
              localField: 'repositoryId',
              foreignField: '_id',
              as: 'repository',
            },
          },
          {
            $unwind: '$repository',
          },
          {
            $group: {
              _id: '$repository.provider',
              count: { $sum: 1 },
            },
          },
        ]),
      ])

      const analysisStatusCounts = Object.fromEntries(
        analysisStatusAgg.map((item: any) => [
          item._id,
          item.count,
        ])
      )

      const riskCounts = Object.fromEntries(
        riskAgg.map((item: any) => [
          item._id,
          item.count,
        ])
      )

      const providerCounts = Object.fromEntries(
        providerAgg.map((item: any) => [
          item._id,
          item.count,
        ])
      )

      res.status(200).json({
        success: true,
        status: 200,
        message: 'Pull request summary fetched successfully.',
        data: {
          totalPRs,

          analysisStatus: {
            done: analysisStatusCounts.DONE ?? 0,
            failed: analysisStatusCounts.FAILED ?? 0,
          },

          risks: {
            low: riskCounts.LOW ?? 0,
            medium: riskCounts.MEDIUM ?? 0,
            high: riskCounts.HIGH ?? 0,
            critical: riskCounts.CRITICAL ?? 0,
          },

          providerCounts: {
            github: providerCounts.github ?? 0,
            gitlab: providerCounts.gitlab ?? 0,
            bitbucket: providerCounts.bitbucket ?? 0,
            azure: providerCounts.azure ?? 0,
            codecommit: providerCounts.codecommit ?? 0,
          },
        },
      })
    } catch (error) {
      next(error)
    }
  }



}

export const analysisController = new AnalysisController()
