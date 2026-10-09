import { Response, NextFunction } from 'express'
import { z } from 'zod'
import { FeedbackModel } from '../models/Feedback.model'
import { FeedbackType, FeedbackStatus } from '../globals/enums'
import { AuthenticatedRequest } from '../globals/types'
import { ValidationError, NotFoundError, AppError } from '../lib/errors'
import { logger } from '../lib/logger'
import fs from 'fs'
import path from 'path'
import {FEEDBACK_UPLOAD_DIR, FEEDBACK_PUBLIC_PATH, MAX_SCREENSHOTS, hasImageSignature} from '../middleware/feedback-upload.middleware'

const CreateFeedbackSchema = z.object({
  type: z.nativeEnum(FeedbackType),
  title: z.string().min(3).max(1500),
  description: z.string().min(5).max(30000),
})

const toPublicUrl = (filename: string) => `${FEEDBACK_PUBLIC_PATH}/${filename}`

const uploadedFiles = (req: AuthenticatedRequest): Express.Multer.File[] =>
  (req.files as Express.Multer.File[] | undefined) ?? []

// URL ya file name se disk ki file delete (path.basename se traversal nahi ho sakta)
async function removeFiles(urlsOrNames: string[]) {
  await Promise.all(
    urlsOrNames.map(async (u) => {
      try {
        await fs.promises.unlink(path.join(FEEDBACK_UPLOAD_DIR, path.basename(u)))
      } catch {
        // file pehle se nahi hai to koi dikkat nahi
      }
    })
  )
}

async function verifyUploads(files: Express.Multer.File[]) {
  for (const f of files) {
    if (!(await hasImageSignature(f.path))) {
      throw new ValidationError('One of the files is not a valid image')
    }
  }
}




export class FeedbackController {
  // POST /api/feedback
  async create(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    const files = uploadedFiles(req)
    try {
      const parsed = CreateFeedbackSchema.safeParse(req.body)
      if (!parsed.success) throw new ValidationError('Invalid feedback data')
      await verifyUploads(files)

      const feedback = await FeedbackModel.create({
        userId: req.user!.userId,
        ...parsed.data,
        screenshots: files.map((f) => toPublicUrl(f.filename)),
        status: FeedbackStatus.SUBMITTED,
        statusHistory: [{ status: FeedbackStatus.SUBMITTED, changedAt: new Date() }],
      })

      logger.info({ userId: req.user!.userId, feedbackId: feedback._id }, 'Feedback submitted')

      res.status(201).json({
        success: true,
        status: 201,
        message: 'Feedback submitted successfully.',
        data: { feedback },
      })
    } catch (error) {
      await removeFiles(files.map((f) => f.filename)) // fail hua to upload ki hui files hata do
      next(error)
    }
  }

  // GET /api/feedback
  async listMine(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const feedback = await FeedbackModel.find({ userId: req.user!.userId }).sort({ createdAt: -1 })
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

  // GET /api/feedback/:id
  async getOne(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const feedback = await FeedbackModel.findOne({ _id: req.params.id, userId: req.user!.userId })
      if (!feedback) throw new NotFoundError('Feedback not found')

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

  // DELETE /api/feedback/:id
  async delete(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const feedback = await FeedbackModel.findOneAndDelete({
        _id: req.params.id,
        userId: req.user!.userId,
      })

      if (!feedback) {
        throw new NotFoundError('Feedback not found')
      }

      await removeFiles(feedback.screenshots ?? []) // disk se screenshots bhi hatao

      logger.info(
        {
          userId: req.user!.userId,
          feedbackId: feedback._id,
        },
        'Feedback deleted'
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

  // PUT /api/feedback/:id
  async update(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    const files = uploadedFiles(req)
    try {
      const parsed = CreateFeedbackSchema.safeParse(req.body)
      if (!parsed.success) throw new ValidationError('Invalid feedback data')

      const feedback = await FeedbackModel.findOne({ _id: req.params.id, userId: req.user!.userId })
      if (!feedback) throw new NotFoundError('Feedback not found')

      if (feedback.status !== FeedbackStatus.SUBMITTED) {
        throw new AppError(
          'This feedback is already being reviewed and can no longer be edited.',
          400,
          'FEEDBACK_LOCKED'
        )
      }

      // Kaun si purani screenshots hatani hain
      let removeList: string[] = []
      try {
        const raw = JSON.parse(req.body.removeScreenshots ?? '[]')
        if (Array.isArray(raw)) removeList = raw.filter((x): x is string => typeof x === 'string')
      } catch {
        throw new ValidationError('Invalid removeScreenshots')
      }

      const current: string[] = feedback.screenshots ?? []
      const toRemove = current.filter((u) => removeList.includes(u)) // sirf is feedback ki apni files
      const kept = current.filter((u) => !toRemove.includes(u))

      if (kept.length + files.length > MAX_SCREENSHOTS) {
        throw new ValidationError(`You can attach up to ${MAX_SCREENSHOTS} screenshots`)
      }
      await verifyUploads(files)

      feedback.type = parsed.data.type
      feedback.title = parsed.data.title
      feedback.description = parsed.data.description
      feedback.screenshots = [...kept, ...files.map((f) => toPublicUrl(f.filename))]
      await feedback.save()

      await removeFiles(toRemove) // DB save hone ke baad hi purani files delete

      logger.info({ userId: req.user!.userId, feedbackId: feedback._id }, 'Feedback updated')

      res.status(200).json({
        success: true,
        status: 200,
        message: 'Feedback updated successfully.',
        data: { feedback },
      })
    } catch (error) {
      await removeFiles(files.map((f) => f.filename))
      next(error)
    }
  }

}

export const feedbackController = new FeedbackController()