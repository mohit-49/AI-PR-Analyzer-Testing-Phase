import { Response, NextFunction } from 'express'
import { UserModel } from '@/models/User.model'
import { AuthenticatedRequest } from '@/globals/types'
import { logger } from '@/lib/logger'
import { RepositoryModel } from '@/models/Repository.model'
import { PullRequestModel } from '@/models/PullRequest.model'
import { AnalysisModel } from '@/models/Analysis.model'
import { AnalysisStatus, PRStatus, SkillStatus, BillingAction, FeedbackStatus } from '@/globals/enums'
import { RepoSkillModel } from '@/models/RepoSkill.model'
import { BillingUsageModel } from '@/models/BillingUsage.model'

import { FeedbackModel } from '@/models/Feedback.model'
import { z } from 'zod'
import { NotFoundError, ValidationError } from '@/lib/errors'

export class AdminController {
    
    // GET /api/admin/users
    async listUsers(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const { search, plan, provider, status, dateFilter } = req.query
            const page = parseInt(req.query.page as string) || 1
            const limit = parseInt(req.query.limit as string) || 10

            const match: Record<string, any> = {}

            if (search) {
                match.$or = [
                    { name: { $regex: String(search), $options: 'i' } },
                    { email: { $regex: String(search), $options: 'i' } },
                ]
            }
            if (plan) match.plan = String(plan).toUpperCase()
            if (provider) match.connectedProviders = String(provider).toLowerCase()
            if (status) match.isActive = status === 'active'

            if (dateFilter) {
                const now = new Date()
                let from: Date | undefined
                if (dateFilter === 'today') from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
                else if (dateFilter === 'week') from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
                else if (dateFilter === 'month') from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
                else if (dateFilter === 'year') from = new Date(now.getFullYear(), 0, 1)
                if (from) match.createdAt = { $gte: from }
            }

            const pipeline = [
                { $match: match },
                { $sort: { createdAt: -1 as const } },
                {
                    $facet: {
                        data: [
                            { $skip: (page - 1) * limit },
                            { $limit: limit },
                            {
                                $lookup: {
                                    from: 'repositories',
                                    let: { uid: '$_id' },
                                    pipeline: [
                                        { $match: { $expr: { $and: [{ $eq: ['$userId', '$$uid'] }, { $eq: ['$isActive', true] }] } } },
                                        { $count: 'count' },
                                    ],
                                    as: 'repoCount',
                                },
                            },
                            {
                                $lookup: {
                                    from: 'pullrequests',
                                    let: { uid: '$_id' },
                                    pipeline: [{ $match: { $expr: { $eq: ['$userId', '$$uid'] } } }, { $count: 'count' }],
                                    as: 'prCount',
                                },
                            },
                            {
                                $lookup: {
                                    from: 'analyses',
                                    let: { uid: '$_id' },
                                    pipeline: [
                                        { $match: { $expr: { $eq: ['$userId', '$$uid'] } } },
                                        { $group: { _id: null, total: { $sum: '$tokensUsed' } } },
                                    ],
                                    as: 'tokenAgg',
                                },
                            },
                            {
                                $project: {
                                    name: 1,
                                    email: 1,
                                    plan: 1,
                                    isActive: 1,
                                    connectedProviders: 1,
                                    createdAt: 1,
                                    repositories: { $ifNull: [{ $arrayElemAt: ['$repoCount.count', 0] }, 0] },
                                    pullRequests: { $ifNull: [{ $arrayElemAt: ['$prCount.count', 0] }, 0] },
                                    tokensUsed: { $ifNull: [{ $arrayElemAt: ['$tokenAgg.total', 0] }, 0] },
                                },
                            },
                        ],
                        totalCount: [{ $count: 'count' }],
                    },
                },
            ]

            const [result] = await UserModel.aggregate(pipeline)
            const total = result?.totalCount?.[0]?.count ?? 0

            res.status(200).json({
                success: true,
                status: 200,
                message: 'Users fetched successfully.',
                data: { users: result?.data ?? [], total, page, limit },
            })
        } catch (error) {
            logger.error({ error: (error as Error)?.message }, 'Admin listUsers failed')
            next(error)
        }
    }

    async listRepositories(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const { search, provider, status } = req.query
            const page = parseInt(req.query.page as string) || 1
            const limit = parseInt(req.query.limit as string) || 10

            const match: Record<string, any> = {}
            if (search) match.fullName = { $regex: String(search), $options: 'i' }
            if (provider) match.provider = String(provider).toLowerCase()
            if (status) match.isActive = status === 'active'

            // Summary cards — always global, independent of the current filters/page
            const [totalRepos, activeRepos, totalPRs, totalAIReviews] = await Promise.all([
                RepositoryModel.countDocuments({}),
                RepositoryModel.countDocuments({ isActive: true }),
                PullRequestModel.countDocuments({}),
                AnalysisModel.countDocuments({}),
            ])

            const total = await RepositoryModel.countDocuments(match)
            const repos = await RepositoryModel.find(match)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .populate('userId', 'name email')

            const repoIds = repos.map((r) => r._id)

            const prAgg = await PullRequestModel.aggregate([
                { $match: { repositoryId: { $in: repoIds } } },
                { $group: { _id: '$repositoryId', count: { $sum: 1 }, lastAnalyzed: { $max: '$updatedAt' }, prIds: { $push: '$_id' } } },
            ])
            const prMap = Object.fromEntries(prAgg.map((p) => [p._id.toString(), p]))
            const allPrIds = prAgg.flatMap((p) => p.prIds)

            const analysisAgg = await AnalysisModel.aggregate([
                { $match: { pullRequestId: { $in: allPrIds } } },
                { $lookup: { from: 'pullrequests', localField: 'pullRequestId', foreignField: '_id', as: 'pr' } },
                { $unwind: '$pr' },
                { $group: { _id: '$pr.repositoryId', count: { $sum: 1 } } },
            ])
            const aiReviewsMap = Object.fromEntries(analysisAgg.map((a) => [a._id.toString(), a.count]))

            const data = repos.map((r) => {
                const stats = prMap[r._id.toString()]
                return {
                    _id: r._id,
                    fullName: r.fullName,
                    provider: r.provider,
                    isActive: r.isActive,
                    connectedUser: (r.userId as any)?.name ?? 'Unknown',
                    pullRequests: stats?.count ?? 0,
                    aiReviews: aiReviewsMap[r._id.toString()] ?? 0,
                    lastAnalyzed: stats?.lastAnalyzed ?? null,
                    createdAt: r.createdAt,
                }
            })

            res.status(200).json({
                success: true,
                status: 200,
                message: 'Repositories fetched successfully.',
                data: {
                    repositories: data,
                    total,
                    page,
                    limit,
                    summary: { totalRepos, activeRepos, totalPRs, totalAIReviews },
                },
            })
        } catch (error) {
            logger.error({ error: (error as Error)?.message }, 'Admin listRepositories failed')
            next(error)
        }
    }

    // GET /api/admin/pull-requests
    async listPullRequests(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const { search, provider, aiStatus, dateFilter } = req.query
            const page = parseInt(req.query.page as string) || 1
            const limit = parseInt(req.query.limit as string) || 10

            const matchStage: Record<string, any> = {}
            if (search) {
                matchStage.$or = [
                    { title: { $regex: String(search), $options: 'i' } },
                    { author: { $regex: String(search), $options: 'i' } },
                    { 'repo.fullName': { $regex: String(search), $options: 'i' } },
                ]
            }
            if (provider) matchStage['repo.provider'] = String(provider).toLowerCase()
            if (aiStatus) matchStage.analysisStatus = String(aiStatus).toUpperCase()

            if (dateFilter) {
                const now = new Date()
                let from: Date | undefined
                if (dateFilter === 'today') from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
                else if (dateFilter === 'week') from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
                else if (dateFilter === 'month') from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
                if (from) matchStage.createdAt = { $gte: from }
            }

            // Summary cards — always global counts, independent of the current filters/page
            const [total, pending, analyzing, done, failed, queued] = await Promise.all([
                PullRequestModel.countDocuments({}),
                PullRequestModel.countDocuments({ analysisStatus: AnalysisStatus.PENDING }),
                PullRequestModel.countDocuments({ analysisStatus: AnalysisStatus.ANALYZING }),
                PullRequestModel.countDocuments({ analysisStatus: AnalysisStatus.DONE }),
                PullRequestModel.countDocuments({ analysisStatus: AnalysisStatus.FAILED }),
                PullRequestModel.countDocuments({ analysisStatus: AnalysisStatus.QUEUED }),
            ])

            const basePipeline = [
                { $lookup: { from: 'repositories', localField: 'repositoryId', foreignField: '_id', as: 'repo' } },
                { $unwind: '$repo' },
                { $match: matchStage },
                {
                    $lookup: {
                        from: 'analyses',
                        localField: '_id',
                        foreignField: 'pullRequestId',
                        as: 'analysis',
                    },
                },
                { $unwind: { path: '$analysis', preserveNullAndEmptyArrays: true } },
                { $sort: { createdAt: -1 as const } },
            ]

            const [result] = await PullRequestModel.aggregate([
                ...basePipeline,
                {
                    $facet: {
                        data: [
                            { $skip: (page - 1) * limit },
                            { $limit: limit },
                            {
                                $project: {
                                    prNumber: 1,
                                    title: 1,
                                    author: 1,
                                    status: 1,
                                    analysisStatus: 1,
                                    baseBranch: 1,
                                    headBranch: 1,
                                    createdAt: 1,
                                    repoFullName: '$repo.fullName',
                                    provider: '$repo.provider',
                                    processingTimeMs: '$analysis.processingTimeMs',
                                    critical: {
                                        $size: {
                                            $filter: {
                                                input: { $ifNull: ['$analysis.reviewComments', []] },
                                                cond: { $eq: ['$$this.severity', 'ERROR'] },
                                            },
                                        },
                                    },
                                    major: {
                                        $size: {
                                            $filter: {
                                                input: { $ifNull: ['$analysis.reviewComments', []] },
                                                cond: { $eq: ['$$this.severity', 'WARNING'] },
                                            },
                                        },
                                    },
                                    suggestions: { $size: { $ifNull: ['$analysis.testingSuggestions', []] } },
                                },
                            },
                        ],
                        totalCount: [{ $count: 'count' }],
                    },
                },
            ])

            res.status(200).json({
                success: true,
                status: 200,
                message: 'Pull requests fetched successfully.',
                data: {
                    pullRequests: result?.data ?? [],
                    total: result?.totalCount?.[0]?.count ?? 0,
                    page,
                    limit,
                    summary: { total, pending, analyzing, done, failed, queued },
                },
            })
        } catch (error) {
            logger.error({ error: (error as Error)?.message }, 'Admin listPullRequests failed')
            next(error)
        }
    }

    // GET /api/admin/skill-files
    async listSkillFiles(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const { search, status } = req.query
            const page = parseInt(req.query.page as string) || 1
            const limit = parseInt(req.query.limit as string) || 10

            const match: Record<string, any> = {}
            if (status) match.status = String(status).toUpperCase()

            const basePipeline = [
                { $lookup: { from: 'repositories', localField: 'repositoryId', foreignField: '_id', as: 'repo' } },
                { $unwind: '$repo' },
                ...(search
                    ? [
                        {
                            $match: {
                                $or: [
                                    { 'repo.fullName': { $regex: String(search), $options: 'i' } },
                                    { fileName: { $regex: String(search), $options: 'i' } },
                                ],
                            },
                        },
                    ]
                    : []),
                { $match: match },
                { $sort: { updatedAt: -1 as const } },
            ]

            const [result] = await RepoSkillModel.aggregate([
                ...basePipeline,
                {
                    $facet: {
                        data: [
                            { $skip: (page - 1) * limit },
                            { $limit: limit },
                            {
                                $project: {
                                    fileName: 1,
                                    status: 1,
                                    isActive: 1,
                                    source: 1,
                                    aiModel: 1,
                                    tokensUsed: 1,
                                    generationMethod: 1,
                                    lastEditedBy: 1,
                                    errorMessage: 1,
                                    createdAt: 1,
                                    updatedAt: 1,
                                    repoFullName: '$repo.fullName',
                                },
                            },
                        ],
                        totalCount: [{ $count: 'count' }],
                        statusCounts: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
                    },
                },
            ])

            const total = result?.totalCount?.[0]?.count ?? 0
            const statusCounts = Object.fromEntries((result?.statusCounts ?? []).map((s: any) => [s._id, s.count]))

            // Summary — total is always global (independent of filters), status breakdown too
            const globalStatusCounts = await RepoSkillModel.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }])
            const globalCounts = Object.fromEntries(globalStatusCounts.map((s: any) => [s._id, s.count]))
            const globalTotal = await RepoSkillModel.countDocuments({})

            res.status(200).json({
                success: true,
                status: 200,
                message: 'Skill files fetched successfully.',
                data: {
                    skillFiles: result?.data ?? [],
                    total,
                    page,
                    limit,
                    summary: {
                        total: globalTotal,
                        ready: globalCounts[SkillStatus.READY] ?? 0,
                        pending: globalCounts[SkillStatus.PENDING] ?? 0,
                        generating: globalCounts[SkillStatus.GENERATING] ?? 0,
                        failed: globalCounts[SkillStatus.FAILED] ?? 0,
                    },
                },
            })
        } catch (error) {
            logger.error({ error: (error as Error)?.message }, 'Admin listSkillFiles failed')
            next(error)
        }
    }

    private getDateRangeStart(range: string): Date {
        const now = new Date()
        switch (range) {
            case '7d':
                return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
            case 'thisMonth':
                return new Date(now.getFullYear(), now.getMonth(), 1)
            case 'lastMonth':
                return new Date(now.getFullYear(), now.getMonth() - 1, 1)
            case 'thisYear':
                return new Date(now.getFullYear(), 0, 1)
            case '30d':
            default:
                return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        }
    }

    // GET /api/admin/token-usage/overview?dateRange=30d&granularity=daily
    async getTokenUsageOverview(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const dateRange = (req.query.dateRange as string) || '30d'
            const granularity = (req.query.granularity as string) || 'daily'
            const from = this.getDateRangeStart(dateRange)

            // lastMonth needs an explicit upper bound too, everything else runs to "now"
            const to = dateRange === 'lastMonth' ? new Date(new Date().getFullYear(), new Date().getMonth(), 1) : new Date()

            const match = { createdAt: { $gte: from, $lte: to } }

            const [summaryAgg] = await BillingUsageModel.aggregate([
                { $match: match },
                {
                    $group: {
                        _id: null,
                        totalRequests: { $sum: 1 },
                        inputTokens: { $sum: '$inputTokens' },
                        outputTokens: { $sum: '$outputTokens' },
                        totalTokens: { $sum: '$tokensUsed' },
                    },
                },
            ])

            const dateFormat = granularity === 'monthly' ? '%Y-%m' : granularity === 'weekly' ? '%G-W%V' : '%Y-%m-%d'
            const trend = await BillingUsageModel.aggregate([
                { $match: match },
                {
                    $group: {
                        _id: { $dateToString: { format: dateFormat, date: '$createdAt' } },
                        tokens: { $sum: '$tokensUsed' },
                        requests: { $sum: 1 },
                    },
                },
                { $sort: { _id: 1 } },
            ])

            const topPRs = await BillingUsageModel.aggregate([
                { $match: { ...match, action: BillingAction.PR_ANALYSIS, prId: { $exists: true } } },
                { $group: { _id: '$prId', tokens: { $sum: '$tokensUsed' }, requests: { $sum: 1 } } },
                { $sort: { tokens: -1 } },
                { $limit: 4 },
                { $lookup: { from: 'pullrequests', localField: '_id', foreignField: '_id', as: 'pr' } },
                { $unwind: '$pr' },
                { $project: { prNumber: '$pr.prNumber', tokens: 1, requests: 1 } },
            ])

            const topSkillFiles = await BillingUsageModel.aggregate([
                { $match: { ...match, action: BillingAction.SKILL_GENERATION, repositoryId: { $exists: true } } },
                { $group: { _id: '$repositoryId', tokens: { $sum: '$tokensUsed' }, requests: { $sum: 1 } } },
                { $sort: { tokens: -1 } },
                { $limit: 4 },
                { $lookup: { from: 'repositories', localField: '_id', foreignField: '_id', as: 'repo' } },
                { $unwind: '$repo' },
                { $project: { fullName: '$repo.fullName', tokens: 1, requests: 1 } },
            ])

            const distinctModels = await BillingUsageModel.distinct('aiModel', { aiModel: { $ne: '' } })

            res.status(200).json({
                success: true,
                status: 200,
                message: 'Token usage overview fetched successfully.',
                data: {
                    summary: {
                        totalRequests: summaryAgg?.totalRequests ?? 0,
                        inputTokens: summaryAgg?.inputTokens ?? 0,
                        outputTokens: summaryAgg?.outputTokens ?? 0,
                        totalTokens: summaryAgg?.totalTokens ?? 0,
                        estimatedCost: 0, // self-hosted Ollama + Groq free tier — no real monetary cost
                    },
                    trend,
                    topPRs,
                    topSkillFiles,
                    availableModels: distinctModels,
                },
            })
        } catch (error) {
            logger.error({ error: (error as Error)?.message }, 'Admin getTokenUsageOverview failed')
            next(error)
        }
    }

    // GET /api/admin/token-usage
    async listTokenUsage(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const { search, model, dateRange } = req.query
            const page = parseInt(req.query.page as string) || 1
            const limit = parseInt(req.query.limit as string) || 10

            const match: Record<string, any> = {}
            if (dateRange) match.createdAt = { $gte: this.getDateRangeStart(String(dateRange)) }
            if (model) match.aiModel = String(model)

            const basePipeline: any[] = [
                { $match: match },
                { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
                { $unwind: '$user' },
                { $lookup: { from: 'repositories', localField: 'repositoryId', foreignField: '_id', as: 'repo' } },
                { $unwind: { path: '$repo', preserveNullAndEmptyArrays: true } },
                ...(search
                    ? [
                        {
                            $match: {
                                $or: [
                                    { 'user.name': { $regex: String(search), $options: 'i' } },
                                    { 'user.email': { $regex: String(search), $options: 'i' } },
                                    { 'repo.fullName': { $regex: String(search), $options: 'i' } },
                                ],
                            },
                        },
                    ]
                    : []),
                // One row per user + repo + model combination — matches how usage is naturally read
                {
                    $group: {
                        _id: { userId: '$userId', repositoryId: '$repositoryId', aiModel: '$aiModel' },
                        userName: { $first: '$user.name' },
                        userEmail: { $first: '$user.email' },
                        repoFullName: { $first: '$repo.fullName' },
                        llmProvider: { $first: '$llmProvider' },
                        requests: { $sum: 1 },
                        inputTokens: { $sum: '$inputTokens' },
                        outputTokens: { $sum: '$outputTokens' },
                        totalTokens: { $sum: '$tokensUsed' },
                        lastUsedAt: { $max: '$createdAt' },
                    },
                },
                { $sort: { totalTokens: -1 as const } },
            ]

            const [result] = await BillingUsageModel.aggregate([
                ...basePipeline,
                {
                    $facet: {
                        data: [
                            { $skip: (page - 1) * limit },
                            { $limit: limit },
                            {
                                $project: {
                                    _id: 0,
                                    userName: 1,
                                    userEmail: 1,
                                    repoFullName: 1,
                                    aiModel: '$_id.aiModel',
                                    llmProvider: 1,
                                    requests: 1,
                                    inputTokens: 1,
                                    outputTokens: 1,
                                    totalTokens: 1,
                                    lastUsedAt: 1,
                                },
                            },
                        ],
                        totalCount: [{ $count: 'count' }],
                    },
                },
            ])

            res.status(200).json({
                success: true,
                status: 200,
                message: 'Token usage records fetched successfully.',
                data: {
                    records: result?.data ?? [],
                    total: result?.totalCount?.[0]?.count ?? 0,
                    page,
                    limit,
                },
            })
        } catch (error) {
            logger.error({ error: (error as Error)?.message }, 'Admin listTokenUsage failed')
            next(error)
        }
    }

    // GET /api/admin/feedback
    async listFeedback(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const { status, type, search } = req.query
            const page = parseInt(req.query.page as string) || 1
            const limit = parseInt(req.query.limit as string) || 10

            const match: Record<string, any> = {}
            if (status) match.status = String(status).toUpperCase()
            if (type) match.type = String(type).toUpperCase()

            const pipeline: any[] = [
                { $match: match },
                { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
                { $unwind: '$user' },
                ...(search
                    ? [
                        {
                            $match: {
                                $or: [
                                    { title: { $regex: String(search), $options: 'i' } },
                                    { 'user.name': { $regex: String(search), $options: 'i' } },
                                    { 'user.email': { $regex: String(search), $options: 'i' } },
                                ],
                            },
                        },
                    ]
                    : []),
                { $sort: { createdAt: -1 as const } },
            ]

            const [result] = await FeedbackModel.aggregate([
                ...pipeline,
                {
                    $facet: {
                        data: [
                            { $skip: (page - 1) * limit },
                            { $limit: limit },
                            {
                                $project: {
                                    type: 1,
                                    title: 1,
                                    description: 1,
                                    status: 1,
                                    createdAt: 1,
                                    userName: '$user.name',
                                    userEmail: '$user.email',
                                },
                            },
                        ],
                        totalCount: [{ $count: 'count' }],
                    },
                },
            ])

            res.status(200).json({
                success: true,
                status: 200,
                message: 'Feedback fetched successfully.',
                data: { feedback: result?.data ?? [], total: result?.totalCount?.[0]?.count ?? 0, page, limit },
            })
        } catch (error) {
            next(error)
        }
    }

    // GET /api/admin/feedback/:id
    async getFeedbackDetail(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const feedback = await FeedbackModel.findById(req.params.id).populate('userId', 'name email')
            if (!feedback) throw new NotFoundError('Feedback not found')

            // Auto-mark as VIEWED the first time an admin opens it — mirrors common ticketing behavior
            if (feedback.status === FeedbackStatus.SUBMITTED) {
                feedback.status = FeedbackStatus.VIEWED
                feedback.statusHistory.push({ status: FeedbackStatus.VIEWED, changedBy: req.user!.userId as any, changedAt: new Date() })
                await feedback.save()
            }

            res.status(200).json({
                success: true,
                status: 200,
                message: 'Feedback fetched successfully.',
                data: { feedback },
            })
        } catch (error) {
            next(error)
        }
    }

    // PATCH /api/admin/feedback/:id/status
    async updateFeedbackStatus(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const schema = z.object({
                status: z.nativeEnum(FeedbackStatus),
                note: z.string().max(1000).optional(),
            })
            const parsed = schema.safeParse(req.body)
            if (!parsed.success) throw new ValidationError('Invalid status update')

            const feedback = await FeedbackModel.findById(req.params.id)
            if (!feedback) throw new NotFoundError('Feedback not found')

            feedback.status = parsed.data.status
            feedback.statusHistory.push({
                status: parsed.data.status,
                note: parsed.data.note ?? '',
                changedBy: req.user!.userId as any,
                changedAt: new Date(),
            })
            await feedback.save()

            logger.info({ feedbackId: feedback._id, status: parsed.data.status, adminId: req.user!.userId }, 'Feedback status updated')

            res.status(200).json({
                success: true,
                status: 200,
                message: 'Feedback status updated successfully.',
                data: { feedback },
            })
        } catch (error) {
            next(error)
        }
    }

    // DELETE /api/admin/feedback/:id
    async deleteFeedback(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const schema = z.object({ reason: z.string().min(3).max(500) })
            const parsed = schema.safeParse(req.body)
            if (!parsed.success) throw new ValidationError('A reason is required to delete feedback')

            const feedback = await FeedbackModel.findById(req.params.id)
            if (!feedback) throw new NotFoundError('Feedback not found')

            feedback.status = FeedbackStatus.DELETED
            feedback.statusHistory.push({
                status: FeedbackStatus.DELETED,
                note: parsed.data.reason,
                changedBy: req.user!.userId as any,
                changedAt: new Date(),
            })
            await feedback.save()

            logger.info(
                { feedbackId: feedback._id, adminId: req.user!.userId, reason: parsed.data.reason },
                'Feedback deleted by admin'
            )

            res.status(200).json({
                success: true,
                status: 200,
                message: 'Feedback deleted successfully.',
                data: { feedback },
            })
        } catch (error) {
            next(error)
        }
    }

    // GET /api/admin/dashboard?trendRange=7d
    async getDashboard(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const trendRange = (req.query.trendRange as string) || '7d'
            const trendFrom = this.getDateRangeStart(trendRange === '90d' ? 'thisYear' : trendRange) // 90d falls back to a wide window below
            const trendFromDate = trendRange === '90d' ? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) : trendFrom

            const [
                userTotal,
                userActive,
                providerBreakdown,
                repoTotal,
                repoActive,
                prByStatus,
                skillByStatus,
                billingSummary,
                feedbackByStatus,
                avgProcessingAgg,
                trend,
                topRepos,
                recentUsers,
                recentRepos,
                recentDonePRs,
            ] = await Promise.all([
                UserModel.countDocuments({}),
                UserModel.countDocuments({ isActive: true }),
                RepositoryModel.aggregate([{ $group: { _id: '$provider', count: { $sum: 1 } } }]),
                RepositoryModel.countDocuments({}),
                RepositoryModel.countDocuments({ isActive: true }),
                PullRequestModel.aggregate([{ $group: { _id: '$analysisStatus', count: { $sum: 1 } } }]),
                RepoSkillModel.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
                BillingUsageModel.aggregate([
                    { $group: { _id: null, requests: { $sum: 1 }, input: { $sum: '$inputTokens' }, output: { $sum: '$outputTokens' }, total: { $sum: '$tokensUsed' } } },
                ]),
                FeedbackModel.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
                AnalysisModel.aggregate([
                    { $lookup: { from: 'pullrequests', localField: 'pullRequestId', foreignField: '_id', as: 'pr' } },
                    { $unwind: '$pr' },
                    { $match: { 'pr.analysisStatus': AnalysisStatus.DONE } },
                    { $group: { _id: null, avgMs: { $avg: '$processingTimeMs' } } },
                ]),
                BillingUsageModel.aggregate([
                    { $match: { createdAt: { $gte: trendFromDate } } },
                    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, tokens: { $sum: '$tokensUsed' }, requests: { $sum: 1 } } },
                    { $sort: { _id: 1 } },
                ]),
                PullRequestModel.aggregate([
                    { $group: { _id: '$repositoryId', reviews: { $sum: 1 } } },
                    { $sort: { reviews: -1 } },
                    { $limit: 4 },
                    { $lookup: { from: 'repositories', localField: '_id', foreignField: '_id', as: 'repo' } },
                    { $unwind: '$repo' },
                    { $project: { fullName: '$repo.fullName', provider: '$repo.provider', reviews: 1 } },
                ]),
                UserModel.find({}).sort({ createdAt: -1 }).limit(5).select('name email createdAt'),
                RepositoryModel.find({}).sort({ createdAt: -1 }).limit(5).select('fullName createdAt'),
                PullRequestModel.find({ analysisStatus: AnalysisStatus.DONE }).sort({ updatedAt: -1 }).limit(5).populate('repositoryId', 'fullName').select('prNumber updatedAt repositoryId'),
            ])

            const toCountMap = (arr: { _id: string; count: number }[]) => Object.fromEntries(arr.map((x) => [x._id, x.count]))
            const prCounts = toCountMap(prByStatus)
            const skillCounts = toCountMap(skillByStatus)
            const feedbackCounts = toCountMap(feedbackByStatus)
            const billing = billingSummary[0] ?? { requests: 0, input: 0, output: 0, total: 0 }
            const avgProcessingMs = avgProcessingAgg[0]?.avgMs ?? 0

            const completedPRs = prCounts[AnalysisStatus.DONE] ?? 0
            const failedPRs = prCounts[AnalysisStatus.FAILED] ?? 0
            const successRate = completedPRs + failedPRs > 0 ? (completedPRs / (completedPRs + failedPRs)) * 100 : 100

            // Merge 3 different collections into one chronological feed
            const activity = [
                ...recentUsers.map((u) => ({ type: 'user', title: 'New user registered', description: u.email, time: u.createdAt })),
                ...recentRepos.map((r) => ({ type: 'repo', title: 'New repository connected', description: r.fullName, time: r.createdAt })),
                ...recentDonePRs.map((pr: any) => ({
                    type: 'pr',
                    title: 'AI review completed',
                    description: `${pr.repositoryId?.fullName ?? 'Unknown repo'} — PR #${pr.prNumber}`,
                    time: pr.updatedAt,
                })),
            ]
                .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
                .slice(0, 6)

            res.status(200).json({
                success: true,
                status: 200,
                message: 'Dashboard data fetched successfully.',
                data: {
                    users: { total: userTotal, active: userActive, inactive: userTotal - userActive },
                    providers: providerBreakdown.map((p) => ({ provider: p._id, count: p.count })),
                    repositories: { total: repoTotal, active: repoActive, inactive: repoTotal - repoActive },
                    pullRequests: {
                        total: Object.values(prCounts).reduce((a: number, b: any) => a + b, 0),
                        pending: prCounts[AnalysisStatus.PENDING] ?? 0,
                        analyzing: prCounts[AnalysisStatus.ANALYZING] ?? 0,
                        done: completedPRs,
                        failed: failedPRs,
                        queued: prCounts[AnalysisStatus.QUEUED] ?? 0,
                    },
                    skillFiles: {
                        total: Object.values(skillCounts).reduce((a: number, b: any) => a + b, 0),
                        ready: skillCounts[SkillStatus.READY] ?? 0,
                        generating: skillCounts[SkillStatus.GENERATING] ?? 0,
                        failed: skillCounts[SkillStatus.FAILED] ?? 0,
                    },
                    aiRequests: { total: billing.requests, inputTokens: billing.input, outputTokens: billing.output, totalTokens: billing.total },
                    feedback: {
                        total: Object.values(feedbackCounts).reduce((a: number, b: any) => a + b, 0),
                        viewed: feedbackCounts[FeedbackStatus.VIEWED] ?? 0,
                        analysis: feedbackCounts[FeedbackStatus.ANALYSIS] ?? 0,
                        processing: feedbackCounts[FeedbackStatus.PROCESSING] ?? 0,
                        completed: feedbackCounts[FeedbackStatus.COMPLETED] ?? 0,
                    },
                    reviewHealth: {
                        completed: completedPRs,
                        failed: failedPRs,
                        pending: prCounts[AnalysisStatus.PENDING] ?? 0,
                        avgProcessingMs,
                        successRate,
                    },
                    trend,
                    topRepositories: topRepos,
                    recentActivity: activity,
                },
            })
        } catch (error) {
            logger.error({ error: (error as Error)?.message }, 'Admin getDashboard failed')
            next(error)
        }
    }


}

export const adminController = new AdminController()