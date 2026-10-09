import { Response, NextFunction } from 'express'
import { UserModel } from '@/models/User.model'
import { AuthenticatedRequest } from '@/globals/types'
import { UnauthorizedError } from '@/lib/errors'
import { logger } from '@/lib/logger'

export const requireAdmin = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await UserModel.findById(req.user.userId).select('role')
    if (!user || user.role !== 'admin') {
      logger.warn({ userId: req.user.userId }, 'Non-admin attempted to access an admin route')
      throw new UnauthorizedError('Admin access required')
    }
    next()
  } catch (error) {
    next(error)
  }
}