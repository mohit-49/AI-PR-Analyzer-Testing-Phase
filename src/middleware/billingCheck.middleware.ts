import { Response, NextFunction } from 'express'
import { UserModel } from '../models/User.model'
import { BillingLimitError } from '../lib/errors'
import { AuthenticatedRequest } from '../globals/types'
import { logger } from '../lib/logger'
import { env } from '../config/env'

export const billingCheckMiddleware = async ( 
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = await UserModel.findById(req.user!.userId).select('tokenUsage plan')
    if (!user) {
      next(new BillingLimitError())
      return
    }

     if (env.LLM_FAMILY === 'ollama') {
      next()
      return
    }

    if (user.tokenUsage.used >= user.tokenUsage.limit) {
      logger.warn({ userId: req.user!.userId }, 'Billing limit exceeded')
      next(new BillingLimitError())
      return
    }

    next()
  } catch (error) {
    next(error)
  }
}
