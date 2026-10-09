import { Request, Response, NextFunction } from 'express'
import crypto from 'crypto' 
import { env } from '../config/env'
import { AppError } from '../lib/errors'
import { logger } from '../lib/logger'

export const webhookVerifyMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const signature = req.headers['x-hub-signature-256'] as string

  if (!signature) {
    logger.warn('Webhook received without signature')
    next(new AppError('Missing webhook signature', 401, 'WEBHOOK_UNAUTHORIZED'))
    return
  }

  const rawBody = JSON.stringify(req.body)
  const expectedSignature = `sha256=${crypto
    .createHmac('sha256', env.GITHUB_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex')}`

  const isValid = crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  )

  if (!isValid) {
    logger.warn('Invalid webhook signature received')
    next(new AppError('Invalid webhook signature', 401, 'WEBHOOK_UNAUTHORIZED'))
    return
  }

  next()
}
