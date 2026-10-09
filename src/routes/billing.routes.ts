import { Router } from 'express'
import { billingController } from '../controllers/billing.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

router.use(authMiddleware)
router.get('/usage', billingController.getUsage.bind(billingController))

export default router