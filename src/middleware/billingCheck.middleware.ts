import { Response, NextFunction } from 'express'
import { UserModel } from '../models/User.model'
import { BillingLimitError } from '../lib/errors'
import { AuthenticatedRequest } from '../globals/types'
import { logger } from '../lib/logger'
import { env } from '../config/env'

export const billingCheckMiddleware = async ( 
  req: AuthenticatedRequest,


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
