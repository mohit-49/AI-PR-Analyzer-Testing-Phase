// import { Response, NextFunction } from 'express'
// import { z } from 'zod'
// import { RepositoryModel } from '../models/Repository.model'
// import { UserModel } from '../models/User.model'
// import { webhookService } from '../services/webhook.service'
// import { skillGenerationQueue } from '../queues/skill-generation.queue'
// import { getProviderService } from '../services/providers/provider-factory'
// import { AuthenticatedRequest } from '../globals/types'
// import { GitProvider } from '../globals/enums'
// import { getDecryptedTokenForProvider } from '../utils/provider-token.util'
// import { getValidBitbucketAccessToken } from '@/services/providers/bitbucket-refresh-token/bitbucket-token.service'
// import { ValidationError, NotFoundError, AppError } from '../lib/errors'
// import { logger } from '../lib/logger'


// import { PullRequestModel } from '../models/PullRequest.model'
// import { AnalysisModel } from '../models/Analysis.model'
// import { RepoSkillModel } from '../models/RepoSkill.model'
// import { BillingUsageModel } from '../models/BillingUsage.model'
// import { PRStatus, SkillStatus } from '../globals/enums'

// const ConnectRepoSchema = z.object({
//   repoFullName: z.string().min(1),
//   provider: z.nativeEnum(GitProvider).default(GitProvider.GITHUB),
// })

// export class RepositoryController {

//   // GET /api/repositories/available?provider=github|bitbucket
//   async listAvailable(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
//     try {
//       const providerParsed = z.nativeEnum(GitProvider).safeParse(req.query.provider)
//       if (!providerParsed.success) throw new ValidationError('Valid provider query param is required')

//       const provider = providerParsed.data
//       const { userId } = req.user

//       const user = await UserModel.findById(userId).select('githubAccessToken bitbucketAccessToken gitlabAccessToken')
//       if (!user) throw new NotFoundError('User not found')

//       const accessToken =
//         provider === GitProvider.BITBUCKET
//           ? await getValidBitbucketAccessToken(userId)
//           : getDecryptedTokenForProvider(user, provider)

//       const providerService = getProviderService(provider)
//       const repositories = await providerService.getUserRepos(accessToken)

//       res.status(200).json({
//         success: true,
//         status: 200,
//         message: 'Available repositories fetched successfully.',
//         data: { repositories },
//       })
//     } catch (error) {
//       next(error)
//     }
//   }

//   async connect(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
//     try {
//       const parsed = ConnectRepoSchema.safeParse(req.body)
//       if (!parsed.success) throw new ValidationError('repoFullName is required')

//       const { repoFullName, provider } = parsed.data
//       const { userId } = req.user

//       const user = await UserModel.findById(userId).select('githubAccessToken bitbucketAccessToken gitlabAccessToken')
//       if (!user) throw new NotFoundError('User not found')

//       const accessToken = provider === GitProvider.BITBUCKET ? await getValidBitbucketAccessToken(userId) : getDecryptedTokenForProvider(user, provider)
//       const providerService = getProviderService(provider)

//       const repoInfo = await providerService.getRepo(accessToken, repoFullName)

//       const existing = await RepositoryModel.findOne({
//         repoId: repoInfo.id,
//         provider,
//         userId,
//         isActive: true,
//       })
//       if (existing) throw new AppError('Repository already connected', 400, 'ALREADY_EXISTS')

//       const repository = await RepositoryModel.create({
//         userId,
//         provider,
//         repoId: repoInfo.id,
//         fullName: repoInfo.full_name,
//         defaultBranch: repoInfo.default_branch,
//         isPrivate: repoInfo.private,
//       })

//       try {
//         await webhookService.registerWebhook(
//           provider,
//           accessToken,
//           repoFullName,
//           repository._id.toString()
//         )
//         logger.info({ repoFullName, provider }, 'Webhook registered and saved')
//       } catch (webhookError: any) {
//         logger.warn(
//           {
//             status: webhookError?.response?.status,
//             providerError: webhookError?.response?.data,
//             message: webhookError?.message,
//             repoFullName,
//             provider,
//           },
//           'Webhook registration failed — repo saved but webhook not set'
//         )
//       }

//       logger.info({ userId, repoFullName, provider }, 'Repository connected')

//       try {
//         await skillGenerationQueue.add('generate-skill', {
//           repositoryId: repository._id.toString(),
//           userId,
//           provider,
//           githubRepoFullName: repoFullName,
//           defaultBranch: repoInfo.default_branch,
//         })
//         logger.info({ repoFullName }, 'Skill file generation queued')
//       } catch (queueError) {
//         logger.error({ queueError, repoFullName }, 'Failed to queue skill file generation')
//       }

//       res.status(200).json({
//         success: true,
//         status: 200,
//         message: 'Repository connected successfully.',
//         data: { repository }
//       })
//     } catch (error) {
//       next(error)
//     }
//   }

//   async list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
//     try {
//       const repositories = await RepositoryModel.find({
//         userId: req.user.userId,
//         isActive: true,
//       }).sort({ createdAt: -1 })
//       res.status(200).json({
//         success: true,
//         status: 200,
//         message: 'Repositories fetched successfully.',
//         data: { repositories }
//       })
//     } catch (error) {
//       next(error)
//     }
//   }

//   async disconnect(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
//     try {
//       const repository = await RepositoryModel.findOne({
//         _id: req.params.id,
//         userId: req.user.userId,
//       })

//       if (!repository) throw new NotFoundError('Repository not found')

//       if (repository.webhookId) {
//         try {
//           const user = await UserModel.findById(req.user.userId)
//           if (user) {
//             const accessToken =
//               repository.provider === GitProvider.BITBUCKET
//                 ? await getValidBitbucketAccessToken(req.user.userId)
//                 : getDecryptedTokenForProvider(user, repository.provider)

//             await webhookService.removeWebhook(
//               repository.provider,
//               accessToken,
//               repository.fullName,
//               repository.webhookId
//             )
//           }
//         } catch (webhookError) {
//           logger.warn(
//             { repoId: repository._id, webhookError },
//             'Failed to delete webhook on disconnect — continuing anyway'
//           )
//         }
//       }

//       await RepositoryModel.findByIdAndUpdate(repository._id, { isActive: false })

//       res.status(200).json({
//         success: true,
//         status: 200,
//         message: 'Repository disconnected successfully.',
//         data: { message: 'Repository disconnected' }
//       })
//     } catch (error) {
//       next(error)
//     }
//   }

//   // GET /api/repositories/:id/details
//   async getDetails(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
//     try {
//       const repository = await RepositoryModel.findOne({ _id: req.params.id, userId: req.user.userId })
//       if (!repository) throw new NotFoundError('Repository not found')

//       const repoUrlMap: Record<string, string> = {
//         github: `https://github.com/${repository.fullName}`,
//         gitlab: `https://gitlab.com/${repository.fullName}`,
//         bitbucket: `https://bitbucket.org/${repository.fullName}`,
//       }

//       const [prCounts, latestPR, analysisAgg, skillCounts, billingAgg, topAuthors] = await Promise.all([
//         PullRequestModel.aggregate([
//           { $match: { repositoryId: repository._id } },
//           { $group: { _id: '$status', count: { $sum: 1 } } },
//         ]),
//         PullRequestModel.findOne({ repositoryId: repository._id }).sort({ updatedAt: -1 }).select('updatedAt'),
//         AnalysisModel.aggregate([
//           { $lookup: { from: 'pullrequests', localField: 'pullRequestId', foreignField: '_id', as: 'pr' } },
//           { $unwind: '$pr' },
//           { $match: { 'pr.repositoryId': repository._id } },
//           {
//             $group: {
//               _id: null,
//               avgRiskScore: { $avg: '$riskScore' },
//               critical: { $sum: { $cond: [{ $eq: ['$riskLevel', 'CRITICAL'] }, 1, 0] } },
//               high: { $sum: { $cond: [{ $eq: ['$riskLevel', 'HIGH'] }, 1, 0] } },
//               medium: { $sum: { $cond: [{ $eq: ['$riskLevel', 'MEDIUM'] }, 1, 0] } },
//               low: { $sum: { $cond: [{ $eq: ['$riskLevel', 'LOW'] }, 1, 0] } },
//               testingSuggestionsCount: { $sum: { $size: { $ifNull: ['$testingSuggestions', []] } } },
//               errorComments: {
//                 $sum: {
//                   $size: { $filter: { input: { $ifNull: ['$reviewComments', []] }, cond: { $eq: ['$$this.severity', 'ERROR'] } } },
//                 },
//               },
//               warningComments: {
//                 $sum: {
//                   $size: { $filter: { input: { $ifNull: ['$reviewComments', []] }, cond: { $eq: ['$$this.severity', 'WARNING'] } } },
//                 },
//               },
//               infoComments: {
//                 $sum: {
//                   $size: { $filter: { input: { $ifNull: ['$reviewComments', []] }, cond: { $eq: ['$$this.severity', 'INFO'] } } },
//                 },
//               },
//             },
//           },
//         ]),
//         RepoSkillModel.aggregate([
//           { $match: { repositoryId: repository._id } },
//           { $group: { _id: '$status', count: { $sum: 1 }, activeCount: { $sum: { $cond: ['$isActive', 1, 0] } } } },
//         ]),
//         BillingUsageModel.aggregate([
//           { $match: { repositoryId: repository._id } },
//           { $group: { _id: null, requests: { $sum: 1 }, input: { $sum: '$inputTokens' }, output: { $sum: '$outputTokens' }, total: { $sum: '$tokensUsed' } } },
//         ]),
//         PullRequestModel.aggregate([
//           { $match: { repositoryId: repository._id } },
//           { $group: { _id: '$author', prCount: { $sum: 1 } } },
//           { $sort: { prCount: -1 } },
//           { $limit: 4 },
//         ]),
//       ])

//       const prCountMap = Object.fromEntries(prCounts.map((p: any) => [p._id, p.count]))
//       const totalPRs = Object.values(prCountMap).reduce((a: number, b: any) => a + b, 0)
//       const analysis = analysisAgg[0] ?? {}
//       const skillTotal = skillCounts.reduce((sum: number, s: any) => sum + s.count, 0)
//       const skillActive = skillCounts.reduce((sum: number, s: any) => sum + s.activeCount, 0)
//       const billing = billingAgg[0] ?? { requests: 0, input: 0, output: 0, total: 0 }

//       res.status(200).json({
//         success: true,
//         status: 200,
//         message: 'Repository details fetched successfully.',
//         data: {
//           basicInfo: {
//             name: repository.fullName.split('/').pop(),
//             fullName: repository.fullName,
//             owner: repository.fullName.split('/')[0],
//             provider: repository.provider,
//             isPrivate: repository.isPrivate ?? false,
//             defaultBranch: repository.defaultBranch,
//             connectedAt: repository.createdAt,
//             repoUrl: repoUrlMap[repository.provider] ?? null,
//             lastActivityAt: latestPR?.updatedAt ?? null,
//           },
//           prAnalysis: {
//             total: totalPRs,
//             open: prCountMap[PRStatus.OPEN] ?? 0,
//             merged: prCountMap[PRStatus.MERGED] ?? 0,
//             declined: prCountMap[PRStatus.DECLINED] ?? 0,
//           },
//           aiAnalysis: {
//             avgRiskScore: Math.round(analysis.avgRiskScore ?? 0),
//             riskBreakdown: {
//               critical: analysis.critical ?? 0,
//               high: analysis.high ?? 0,
//               medium: analysis.medium ?? 0,
//               low: analysis.low ?? 0,
//             },
//             reviewComments: {
//               error: analysis.errorComments ?? 0,
//               warning: analysis.warningComments ?? 0,
//               info: analysis.infoComments ?? 0,
//             },
//             testingSuggestionsCount: analysis.testingSuggestionsCount ?? 0,
//           },
//           contributors: {
//             totalContributors: topAuthors.length,
//             topContributors: topAuthors.map((a: any) => ({ author: a._id, prCount: a.prCount })),
//           },
//           skillFiles: {
//             total: skillTotal,
//             active: skillActive,
//             inactive: skillTotal - skillActive,
//           },
//           billing: {
//             totalRequests: billing.requests,
//             inputTokens: billing.input,
//             outputTokens: billing.output,
//             totalTokens: billing.total,
//             estimatedCost: 0,
//           },
//         },
//       })
//     } catch (error) {
//       logger.error({ error: (error as Error)?.message }, 'getDetails failed')
//       next(error)
//     }
//   }

// }

// export const repositoryController = new RepositoryController()






// *********************************************************************************************




import { Response, NextFunction } from 'express'
import { z } from 'zod'
import { RepositoryModel } from '../models/Repository.model'
import { UserModel } from '../models/User.model'
import { webhookService } from '../services/webhook.service'
import { skillGenerationQueue } from '../queues/skill-generation.queue'
import { getProviderService } from '../services/providers/provider-factory'
import { AuthenticatedRequest } from '../globals/types'
import { GitProvider } from '../globals/enums'
import { getDecryptedTokenForProvider } from '../utils/provider-token.util'
import { getValidBitbucketAccessToken } from '@/services/providers/bitbucket-refresh-token/bitbucket-token.service'
import { ValidationError, NotFoundError, AppError } from '../lib/errors'
import { logger } from '../lib/logger'
import { Types } from 'mongoose'

import { PullRequestModel } from '../models/PullRequest.model'
import { AnalysisModel } from '../models/Analysis.model'
import { RepoSkillModel } from '../models/RepoSkill.model'
import { BillingUsageModel } from '../models/BillingUsage.model'
import { PRStatus, SkillStatus } from '../globals/enums'

const ConnectRepoSchema = z.object({
  repoFullName: z.string().min(1),
  provider: z.nativeEnum(GitProvider).default(GitProvider.GITHUB),
})

const CommitsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  branch: z.string().min(1).optional(),
})

export class RepositoryController {

  // GET /api/repositories/available?provider=github|bitbucket
  async listAvailable(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const providerParsed = z.nativeEnum(GitProvider).safeParse(req.query.provider)
      if (!providerParsed.success) throw new ValidationError('Valid provider query param is required')

      const provider = providerParsed.data
      const { userId } = req.user

      const user = await UserModel.findById(userId).select('githubAccessToken bitbucketAccessToken gitlabAccessToken')
      if (!user) throw new NotFoundError('User not found')

      const accessToken =
        provider === GitProvider.BITBUCKET
          ? await getValidBitbucketAccessToken(userId)
          : getDecryptedTokenForProvider(user, provider)

      const providerService = getProviderService(provider)
      const repositories = await providerService.getUserRepos(accessToken)

      res.status(200).json({
        success: true,
        status: 200,
        message: 'Available repositories fetched successfully.',
        data: { repositories },
      })
    } catch (error) {
      next(error)
    }
  }

  async connect(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = ConnectRepoSchema.safeParse(req.body)
      if (!parsed.success) throw new ValidationError('repoFullName is required')

      const { repoFullName, provider } = parsed.data
      const { userId } = req.user

      const user = await UserModel.findById(userId).select('githubAccessToken bitbucketAccessToken gitlabAccessToken')
      if (!user) throw new NotFoundError('User not found')

      const accessToken = provider === GitProvider.BITBUCKET ? await getValidBitbucketAccessToken(userId) : getDecryptedTokenForProvider(user, provider)
      const providerService = getProviderService(provider)

      const repoInfo = await providerService.getRepo(accessToken, repoFullName)

      const existing = await RepositoryModel.findOne({
        repoId: repoInfo.id,
        provider,
        userId,
        isActive: true,
      })
      if (existing) throw new AppError('Repository already connected', 400, 'ALREADY_EXISTS')

      const repository = await RepositoryModel.create({
        userId,
        provider,
        repoId: repoInfo.id,
        fullName: repoInfo.full_name,
        defaultBranch: repoInfo.default_branch,
        isPrivate: repoInfo.private,
      })

      try {
        await webhookService.registerWebhook(
          provider,
          accessToken,
          repoFullName,
          repository._id.toString()
        )
        logger.info({ repoFullName, provider }, 'Webhook registered and saved')
      } catch (webhookError: any) {
        logger.warn(
          {
            status: webhookError?.response?.status,
            providerError: webhookError?.response?.data,
            message: webhookError?.message,
            repoFullName,
            provider,
          },
          'Webhook registration failed — repo saved but webhook not set'
        )
      }

      logger.info({ userId, repoFullName, provider }, 'Repository connected')

      try {
        await skillGenerationQueue.add('generate-skill', {
          repositoryId: repository._id.toString(),
          userId,
          provider,
          githubRepoFullName: repoFullName,
          defaultBranch: repoInfo.default_branch,
        })
        logger.info({ repoFullName }, 'Skill file generation queued')
      } catch (queueError) {
        logger.error({ queueError, repoFullName }, 'Failed to queue skill file generation')
      }

      res.status(200).json({
        success: true,
        status: 200,
        message: 'Repository connected successfully.',
        data: { repository }
      })
    } catch (error) {
      next(error)
    }
  }

  async list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const repositories = await RepositoryModel.find({
        userId: req.user.userId,
        isActive: true,
      }).sort({ createdAt: -1 })
      res.status(200).json({
        success: true,
        status: 200,
        message: 'Repositories fetched successfully.',
        data: { repositories }
      })
    } catch (error) {
      next(error)
    }
  }

  async disconnect(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const repository = await RepositoryModel.findOne({
        _id: req.params.id,
        userId: req.user.userId,
      })

      if (!repository) throw new NotFoundError('Repository not found')

      if (repository.webhookId) {
        try {
          const user = await UserModel.findById(req.user.userId)
          if (user) {
            const accessToken =
              repository.provider === GitProvider.BITBUCKET
                ? await getValidBitbucketAccessToken(req.user.userId)
                : getDecryptedTokenForProvider(user, repository.provider)

            await webhookService.removeWebhook(
              repository.provider,
              accessToken,
              repository.fullName,
              repository.webhookId
            )
          }
        } catch (webhookError) {
          logger.warn(
            { repoId: repository._id, webhookError },
            'Failed to delete webhook on disconnect — continuing anyway'
          )
        }
      }

      await RepositoryModel.findByIdAndUpdate(repository._id, { isActive: false })

      res.status(200).json({
        success: true,
        status: 200,
        message: 'Repository disconnected successfully.',
        data: { message: 'Repository disconnected' }
      })
    } catch (error) {
      next(error)
    }
  }


  // GET /api/repositories/:id/details
async getDetails(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const repository = await RepositoryModel.findOne({ _id: req.params.id, userId: req.user.userId })
    if (!repository) throw new NotFoundError('Repository not found')

    const repoUrlMap: Record<string, string> = {
      github: `https://github.com/${repository.fullName}`,
      gitlab: `https://gitlab.com/${repository.fullName}`,
      bitbucket: `https://bitbucket.org/${repository.fullName}`,
    }

    const [prCounts, latestPR, analysisAgg, skillCounts, billingAgg, topAuthors] = await Promise.all([
      PullRequestModel.aggregate([
        { $match: { repositoryId: repository._id } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      PullRequestModel.findOne({ repositoryId: repository._id }).sort({ updatedAt: -1 }).select('updatedAt'),
      AnalysisModel.aggregate([
        { $lookup: { from: 'pullrequests', localField: 'pullRequestId', foreignField: '_id', as: 'pr' } },
        { $unwind: '$pr' },
        { $match: { 'pr.repositoryId': repository._id } },
        {
          $group: {
            _id: null,
            avgRiskScore: { $avg: '$riskScore' },
            critical: { $sum: { $cond: [{ $eq: ['$riskLevel', 'CRITICAL'] }, 1, 0] } },
            high: { $sum: { $cond: [{ $eq: ['$riskLevel', 'HIGH'] }, 1, 0] } },
            medium: { $sum: { $cond: [{ $eq: ['$riskLevel', 'MEDIUM'] }, 1, 0] } },
            low: { $sum: { $cond: [{ $eq: ['$riskLevel', 'LOW'] }, 1, 0] } },
            testingSuggestionsCount: { $sum: { $size: { $ifNull: ['$testingSuggestions', []] } } },
            errorComments: {
              $sum: {
                $size: { $filter: { input: { $ifNull: ['$reviewComments', []] }, cond: { $eq: ['$$this.severity', 'ERROR'] } } },
              },
            },
            warningComments: {
              $sum: {
                $size: { $filter: { input: { $ifNull: ['$reviewComments', []] }, cond: { $eq: ['$$this.severity', 'WARNING'] } } },
              },
            },
            infoComments: {
              $sum: {
                $size: { $filter: { input: { $ifNull: ['$reviewComments', []] }, cond: { $eq: ['$$this.severity', 'INFO'] } } },
              },
            },
          },
        },
      ]),
      RepoSkillModel.aggregate([
        { $match: { repositoryId: repository._id } },
        { $group: { _id: '$status', count: { $sum: 1 }, activeCount: { $sum: { $cond: ['$isActive', 1, 0] } } } },
      ]),
      BillingUsageModel.aggregate([
        { $match: { repositoryId: repository._id } },
        { $group: { _id: null, requests: { $sum: 1 }, input: { $sum: '$inputTokens' }, output: { $sum: '$outputTokens' }, total: { $sum: '$tokensUsed' } } },
      ]),
      PullRequestModel.aggregate([
        { $match: { repositoryId: repository._id } },
        { $group: { _id: '$author', prCount: { $sum: 1 } } },
        { $sort: { prCount: -1 } },
        { $limit: 4 },
      ]),
    ])

    const prCountMap = Object.fromEntries(prCounts.map((p: any) => [p._id, p.count]))
    const totalPRs = Object.values(prCountMap).reduce((a: number, b: any) => a + b, 0)
    const analysis = analysisAgg[0] ?? {}
    const skillTotal = skillCounts.reduce((sum: number, s: any) => sum + s.count, 0)
    const skillActive = skillCounts.reduce((sum: number, s: any) => sum + s.activeCount, 0)
    const billing = billingAgg[0] ?? { requests: 0, input: 0, output: 0, total: 0 }

    res.status(200).json({
      success: true,
      status: 200,
      message: 'Repository details fetched successfully.',
      data: {
        basicInfo: {
          name: repository.fullName.split('/').pop(),
          fullName: repository.fullName,
          owner: repository.fullName.split('/')[0],
          provider: repository.provider,
          isPrivate: repository.isPrivate ?? false,
          defaultBranch: repository.defaultBranch,
          connectedAt: repository.createdAt,
          repoUrl: repoUrlMap[repository.provider] ?? null,
          lastActivityAt: latestPR?.updatedAt ?? null,
        },
        prAnalysis: {
          total: totalPRs,
          open: prCountMap[PRStatus.OPEN] ?? 0,
          merged: prCountMap[PRStatus.MERGED] ?? 0,
          declined: prCountMap[PRStatus.DECLINED] ?? 0,
        },
        aiAnalysis: {
          avgRiskScore: Math.round(analysis.avgRiskScore ?? 0),
          riskBreakdown: {
            critical: analysis.critical ?? 0,
            high: analysis.high ?? 0,
            medium: analysis.medium ?? 0,
            low: analysis.low ?? 0,
          },
          reviewComments: {
            error: analysis.errorComments ?? 0,
            warning: analysis.warningComments ?? 0,
            info: analysis.infoComments ?? 0,
          },
          testingSuggestionsCount: analysis.testingSuggestionsCount ?? 0,
        },
        contributors: {
          // Derived from PR authorship, not commit history — we don't track commits.
          totalContributors: topAuthors.length,
          topContributors: topAuthors.map((a: any) => ({ author: a._id, prCount: a.prCount })),
        },
        skillFiles: {
          total: skillTotal,
          active: skillActive,
          inactive: skillTotal - skillActive,
        },
        billing: {
          totalRequests: billing.requests,
          inputTokens: billing.input,
          outputTokens: billing.output,
          totalTokens: billing.total,
          estimatedCost: 0,
        },
      },
    })
  } catch (error) {
    logger.error({ error: (error as Error)?.message }, 'getDetails failed')
    next(error)
  }
}



  // GET /api/repositories/:id/commits?page=&perPage=&branch=
  // Commits are always fetched live from the provider (GitHub/GitLab/Bitbucket/
  // CodeCommit) — we deliberately do NOT store commit history in our DB. Repos
  // can have thousands/lakhs of commits, the provider already owns and
  // maintains this data, and it can change out from under us (force-push,
  // rebase) — so a live, paginated fetch is the source of truth instead of a
  // copy that can silently go stale.
  async getCommits(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = CommitsQuerySchema.safeParse(req.query)
      if (!parsed.success) throw new ValidationError('Invalid page, perPage or branch query param')
      const { page, perPage, branch } = parsed.data

      const repository = await RepositoryModel.findOne({
        _id: req.params.id,
        userId: req.user.userId,
      })
      if (!repository) throw new NotFoundError('Repository not found')

      const user = await UserModel.findById(req.user.userId).select(
        'githubAccessToken bitbucketAccessToken gitlabAccessToken'
      )
      if (!user) throw new NotFoundError('User not found')

      const accessToken =
        repository.provider === GitProvider.BITBUCKET
          ? await getValidBitbucketAccessToken(req.user.userId)
          : getDecryptedTokenForProvider(user, repository.provider)

      const providerService = getProviderService(repository.provider)
      const targetBranch = branch || repository.defaultBranch

      const result = await providerService.getCommits(
        accessToken,
        repository.fullName,
        targetBranch,
        page,
        perPage
      )

      res.status(200).json({
        success: true,
        status: 200,
        message: 'Commits fetched successfully.',
        data: {
          repository: {
            id: repository._id,
            fullName: repository.fullName,
            provider: repository.provider,
          },
          branch: targetBranch,
          commits: result.commits,
          pagination: {
            page: result.page,
            perPage: result.perPage,
            hasMore: result.hasMore,
          },
          totalCommits: result.totalCount,
          // true => UI should show "~" / "1,204+" style instead of a bare number
          totalCommitsIsApproximate: result.totalIsApproximate,
        },
      })
    } catch (error) {
      logger.error({ error: (error as Error)?.message }, 'getCommits failed')
      next(error)
    }
  }


  // GET /api/repositories/summary
async getSummary(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user.userId

    const [totalRepositories, providerAgg, totalPRs, riskAgg] = await Promise.all([
      RepositoryModel.countDocuments({ userId, isActive: true }),
      RepositoryModel.aggregate([
        { $match: { userId: new Types.ObjectId(userId), isActive: true } },
        { $group: { _id: '$provider', count: { $sum: 1 } } },
      ]),
      PullRequestModel.countDocuments({ userId }),
      AnalysisModel.aggregate([
        { $match: { userId: new Types.ObjectId(userId) } },
        { $group: { _id: null, avgRisk: { $avg: '$riskScore' }, count: { $sum: 1 } } },
      ]),
    ])

    const providerCounts = Object.fromEntries(providerAgg.map((p: any) => [p._id, p.count]))
    const risk = riskAgg[0] ?? { avgRisk: 0, count: 0 }

    res.status(200).json({
      success: true,
      status: 200,
      message: 'Repository summary fetched successfully.',
      data: {
        totalRepositories,
        providerCounts, // e.g. { github: 3, gitlab: 1 } — only providers that actually exist in GitProvider enum will ever appear
        totalPRs,
        avgRiskScore: Math.round(risk.avgRisk ?? 0),
        analyzedRepoCount: risk.count,
      },
    })
  } catch (error) {
    next(error)
  }
}

}

export const repositoryController = new RepositoryController()
