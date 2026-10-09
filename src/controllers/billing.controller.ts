import { Response, NextFunction } from 'express'
import { UserModel } from '../models/User.model'
import { billingService } from '../services/billing.service'
import { AuthenticatedRequest } from '../globals/types'
import { env } from '../config/env'

export class BillingController {
  // GET /api/billing/usage
  async getUsage(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await UserModel.findById(req.user!.userId).select('tokenUsage plan')
      const monthlyUsage = await billingService.getMonthlyUsage(req.user!.userId)

      res.status(200).json({
        success: true,
        status: 200,
        message: 'Billing usage retrieved successfully.',
        data: {
          plan: user?.plan,
          tokenUsage: user?.tokenUsage,
          monthlyBreakdown: monthlyUsage,
          isUnlimited: env.LLM_FAMILY === 'ollama',
        },
      })
    } catch (error) {
      next(error)
    }
  }
}

export const billingController = new BillingController()
