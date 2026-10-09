import { Router } from 'express'
import { webhookController } from '../controllers/webhook.controller'
import { webhookRateLimit } from '../middleware/rateLimit.middleware'

const router = Router()

router.post('/github', webhookRateLimit, webhookController.handleGitHub.bind(webhookController))

export default router


