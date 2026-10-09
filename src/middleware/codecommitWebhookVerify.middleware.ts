import { Request, Response, NextFunction } from 'express'
import crypto from 'crypto'
import { env } from '../config/env'
import { UnauthorizedError } from '../lib/errors'
import { logger } from '../lib/logger'

export const codecommitWebhookVerify = (req: Request, _res: Response, next: NextFunction): void => {
  try {
    if (!env.CODECOMMIT_WEBHOOK_SECRET) {
      logger.error('CODECOMMIT_WEBHOOK_SECRET is not set — refusing all CodeCommit webhook requests')
      throw new UnauthorizedError('Webhook not configured')
    }

    const signature = req.headers['x-codecommit-signature'] as string | undefined
    if (!signature) {
      throw new UnauthorizedError('Missing signature')
    }

    const rawBody = (req as any).rawBody
    if (!rawBody) {
      logger.error('req.rawBody missing — ensure express.json() verify callback captures it for this route')
      throw new UnauthorizedError('Cannot verify signature')
    }

    const expected = crypto
      .createHmac('sha256', env.CODECOMMIT_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex')

    const sigBuffer = Buffer.from(signature)
    const expectedBuffer = Buffer.from(expected)

    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      logger.warn('CodeCommit webhook — invalid signature')
      throw new UnauthorizedError('Invalid signature')
    }

    next()
  } catch (error) {
    next(error)
  }
}