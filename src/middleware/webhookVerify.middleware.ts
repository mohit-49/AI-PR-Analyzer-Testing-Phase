import { Request, Response, NextFunction } from 'express'
import crypto from 'crypto' 
import { env } from '../config/env'
import { AppError } from '../lib/errors'
import { logger } from '../lib/logger'
Signature)
  )

  if (!isValid) {
    logger.warn('Invalid webhook signature received')
    next(new AppError('Invalid webhook signature', 401, 'WEBHOOK_UNAUTHORIZED'))
    return
  }

  next()
}
