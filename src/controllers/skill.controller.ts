import { Response, NextFunction } from 'express'
import { z } from 'zod'
import { RepoSkillModel } from '../models/RepoSkill.model'
import { RepositoryModel } from '../models/Repository.model'
import { skillAnalyzerService } from '../services/skill-analyzer.service'
import { activateSkillVersion } from '../services/skill-version.service'
import { skillAgentGenerationQueue } from '@/queues/skill-agent-generation.queue'
import { AuthenticatedRequest } from '../globals/types'
import { SkillStatus } from '../globals/enums'
import { NotFoundError, ValidationError } from '../lib/errors'
import { logger } from '../lib/logger'
import { Types } from 'mongoose'

const UpdateSkillSchema = z.object({
  techStack: z.array(z.string().min(1)).max(15).optional(),
  conventions: z.array(z.string().min(1)).max(15).optional(),
  summary: z.string().max(600).optional(),
  reviewFocusAreas: z.array(z.string().min(1)).max(10).optional(),
})

async function assertRepoOwnership(repositoryId: string, userId: string) {
  const repository = await RepositoryModel.findOne({ _id: repositoryId, userId, isActive: true })
  if (!repository) throw new NotFoundError('Repository not found or not connected to your account')
  return repository
}

export class SkillController {
  // GET /api/skills/:repositoryId — currently ACTIVE version (existing behavior, unchanged contract)
  async getByRepo(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { repositoryId } = req.params
      await assertRepoOwnership(repositoryId, req.user!.userId)

      const skill = await RepoSkillModel.findOne({ repositoryId, isActive: true })

      if (!skill) {
        res.json({ success: true, data: { skill: null } })
        return
      }

      res.status(200).json({
        success: true,
        status: 200,
        message: 'Current active version fetch successfully.',
        data: { skill }
      })
    } catch (error) {
      next(error)
    }
  }

  // PUT /api/skills/:repositoryId —  (existing behavior, unchanged contract)
  async update(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { repositoryId } = req.params
      await assertRepoOwnership(repositoryId, req.user!.userId)

      const parsed = UpdateSkillSchema.safeParse(req.body)
      if (!parsed.success) throw new ValidationError('Invalid skill file data')

      const updates = parsed.data
      if (Object.keys(updates).length === 0) {
        throw new ValidationError('At least one field must be provided to update')
      }

      const existingActive = await RepoSkillModel.findOne({ repositoryId, isActive: true })

      let skill
      if (existingActive) {
        skill = await RepoSkillModel.findByIdAndUpdate(
          existingActive._id,
          { ...updates, status: SkillStatus.READY, lastEditedBy: 'user', lastEditedAt: new Date() },
          { new: true }
        )
      } else {
        const created = await RepoSkillModel.create({
          ...updates,
          repositoryId,
          userId: req.user!.userId,
          source: 'ai_generated',
          status: SkillStatus.READY,
          lastEditedBy: 'user',
          lastEditedAt: new Date(),
        })
        skill = await activateSkillVersion(repositoryId, created._id)
      }

      logger.info({ repositoryId, userId: req.user!.userId }, 'Active skill file manually updated by user')
      res.status(200).json({
        success: true,
        status: 200,
        message: 'Active skill file manually updated by user successfully.',
        data: { skill }
      })
    } catch (error) {
      next(error)
    }
  }

  async listVersions(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { repositoryId } = req.params
      await assertRepoOwnership(repositoryId, req.user!.userId)

      const versions = await RepoSkillModel.find({ repositoryId }).sort({ createdAt: -1 })

      res.status(200).json({
        success: true,
        status: 200,
        message: 'Versions fetch successfully.',
        data: { versions }
      })
    } catch (error) {
      next(error)
    }
  }

  async updateVersion(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { repositoryId, skillId } = req.params
      await assertRepoOwnership(repositoryId, req.user!.userId)

      const parsed = UpdateSkillSchema.safeParse(req.body)
      if (!parsed.success) throw new ValidationError('Invalid skill file data')

      const updates = parsed.data
      if (Object.keys(updates).length === 0) {
        throw new ValidationError('At least one field must be provided to update')
      }

      const target = await RepoSkillModel.findOne({ _id: skillId, repositoryId })
      if (!target) throw new NotFoundError('Skill file version not found')

      const shouldActivate = req.body.activate !== false

      await RepoSkillModel.findByIdAndUpdate(skillId, {
        ...updates,
        status: SkillStatus.READY,
        lastEditedBy: 'user',
        lastEditedAt: new Date(),
      })

      const skill = shouldActivate
        ? await activateSkillVersion(repositoryId, skillId)
        : await RepoSkillModel.findById(skillId)

      logger.info(
        { repositoryId, skillId, userId: req.user!.userId, activated: shouldActivate },
        shouldActivate ? 'Skill file version edited and activated' : 'Skill file version edited and saved (not activated)'
      )
      res.status(200).json({
        success: true,
        status: 200,
        message: shouldActivate
          ? 'Skill file version edited and activated successfully.'
          : 'Skill file version saved successfully.',
        data: { skill }
      })
    } catch (error) {
      next(error)
    }
  }

  // POST /api/skills/:repositoryId/upload — user .md 
  async uploadFile(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { repositoryId } = req.params
      await assertRepoOwnership(repositoryId, req.user!.userId)

      const file = (req as any).file as Express.Multer.File | undefined
      if (!file) throw new ValidationError('No file uploaded')

      if (!file.originalname.toLowerCase().endsWith('.md')) {
        throw new ValidationError('Only .md files are allowed')
      }

      const markdown = file.buffer.toString('utf-8')
      if (!markdown.trim()) {
        throw new ValidationError('Uploaded file is empty')
      }

      const draft = await RepoSkillModel.create({
        repositoryId,
        userId: req.user!.userId,
        status: SkillStatus.GENERATING,
        source: 'uploaded',
        fileName: file.originalname,
        rawMarkdown: markdown,
        isActive: false,
      })

      try {
        const repository = await RepositoryModel.findById(repositoryId)
        const { output, tokensUsed, aiModel, rawModelOutput } = await skillAnalyzerService.generateFromMarkdown({
          repoFullName: repository?.fullName ?? 'unknown',
          markdown,
        })

        await RepoSkillModel.findByIdAndUpdate(draft._id, {
          status: SkillStatus.READY,
          techStack: output.techStack,
          conventions: output.conventions,
          summary: output.summary,
          reviewFocusAreas: output.reviewFocusAreas,
          rawModelOutput,
          aiModel,
          tokensUsed,
          generatedAt: new Date(),
          errorMessage: undefined,
        })

        const skill = await activateSkillVersion(repositoryId, draft._id)

        logger.info({ repositoryId, fileName: file.originalname }, 'Uploaded skill file parsed and activated')
        res.status(201).json({ success: true, data: { skill } })
      } catch (parseError: any) {
        const failedSkill = await RepoSkillModel.findByIdAndUpdate(
          draft._id,
          { status: SkillStatus.FAILED, errorMessage: parseError?.message ?? 'Failed to parse uploaded file' },
          { new: true }
        )
        logger.error({ repositoryId, error: parseError?.message }, 'Uploaded skill file parsing failed')
        res.status(200).json({
          success: true,
          status: 200,
          message: 'Uploaded skill file and activated successfully.',
          data: { skill: failedSkill }
        })
      }
    } catch (error) {
      next(error)
    }
  }

  async agentGenerate(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { repositoryId } = req.params
      const repository = await assertRepoOwnership(repositoryId, req.user!.userId)

      const draft = await RepoSkillModel.create({
        repositoryId,
        userId: req.user!.userId,
        status: SkillStatus.GENERATING,
        source: 'ai_generated',
        generationMethod: 'agent',
        isActive: false,
      })

      logger.info(
        { repositoryId, userId: req.user!.userId, repoFullName: repository.fullName, skillId: draft._id.toString() },
        'AI Agent skill generation requested'
      )

      await skillAgentGenerationQueue.add('agent-generate-skill', {
        repositoryId,
        userId: req.user!.userId,
        provider: repository.provider,
        githubRepoFullName: repository.fullName,
        defaultBranch: repository.defaultBranch,
        skillId: draft._id.toString(),
      })

      res.status(202).json({
        success: true,
        status: 202,
        message: 'AI agent generation started — this may take up to a minute.',
        data: { skillId: draft._id.toString() },
      })
    } catch (error) {
      logger.error({ error: (error as Error)?.message }, 'Failed to start AI agent skill generation')
      next(error)
    }
  }

  async deleteVersion(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { repositoryId, skillId } = req.params
      await assertRepoOwnership(repositoryId, req.user!.userId)

      const target = await RepoSkillModel.findOne({ _id: skillId, repositoryId })
      if (!target) throw new NotFoundError('Skill file version not found')

      const wasActive = target.isActive

      await RepoSkillModel.findByIdAndDelete(skillId)

      let newActiveSkillId: string | null = null
      if (wasActive) {
        const replacement = await RepoSkillModel.findOne({
          repositoryId,
          status: SkillStatus.READY,
          _id: { $ne: skillId },
        }).sort({ generatedAt: -1, createdAt: -1 })

        if (replacement) {
          await RepoSkillModel.findByIdAndUpdate(replacement._id, { isActive: true })
          newActiveSkillId = replacement._id.toString()
        }
      }

      logger.info({ repositoryId, skillId, wasActive, newActiveSkillId }, 'Skill file version deleted')

      res.status(200).json({
        success: true,
        status: 200,
        message: wasActive
          ? (newActiveSkillId ? 'Active version deleted — the most recent ready version is now active.' : 'Active version deleted — no other ready version is available to activate.')
          : 'Skill file version deleted successfully.',
        data: { newActiveSkillId },
      })
    } catch (error) {
      next(error)
    }
  }


  // GET /api/skills/summary
async getSummary(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId

    const [statusAgg, methodAgg, providerAgg] = await Promise.all([
      RepoSkillModel.aggregate([
        { $match: { userId: new Types.ObjectId(userId) } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      RepoSkillModel.aggregate([
        { $match: { userId: new Types.ObjectId(userId) } },
        {
          $group: {
            _id: null,
            singleShot: { $sum: { $cond: [{ $and: [{ $eq: ['$source', 'ai_generated'] }, { $eq: ['$generationMethod', 'single_shot'] }] }, 1, 0] } },
            agent: { $sum: { $cond: [{ $eq: ['$generationMethod', 'agent'] }, 1, 0] } },
            uploaded: { $sum: { $cond: [{ $eq: ['$source', 'uploaded'] }, 1, 0] } },
          },
        },
      ]),
      RepoSkillModel.aggregate([
        { $match: { userId: new Types.ObjectId(userId) } },
        { $lookup: { from: 'repositories', localField: 'repositoryId', foreignField: '_id', as: 'repo' } },
        { $unwind: '$repo' },
        { $group: { _id: '$repo.provider', count: { $sum: 1 } } },
      ]),
    ])

    const statusCounts = Object.fromEntries(statusAgg.map((s: any) => [s._id, s.count]))
    const methods = methodAgg[0] ?? { singleShot: 0, agent: 0, uploaded: 0 }
    const providerCounts = Object.fromEntries(providerAgg.map((p: any) => [p._id, p.count]))

    const total = Object.values(statusCounts).reduce((a: number, b: any) => a + b, 0)
    const active = await RepoSkillModel.countDocuments({ userId: new Types.ObjectId(userId), isActive: true })

    res.status(200).json({
      success: true,
      status: 200,
      message: 'Skill files summary fetched successfully.',
      data: {
        total,
        active,
        inactive: total - active,
        methods: { singleShot: methods.singleShot, agent: methods.agent, uploaded: methods.uploaded },
        providerCounts,
        statusCounts: {
          ready: statusCounts.READY ?? 0,
          failed: statusCounts.FAILED ?? 0,
        },
      },
    })
  } catch (error) {
    next(error)
  }
}


}

export const skillController = new SkillController()

