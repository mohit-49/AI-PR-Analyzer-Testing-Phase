import { Router } from 'express'
import { bitbucketWebhookController } from '../controllers/bitbucket-webhook.controller'
import { webhookRateLimit } from '../middleware/rateLimit.middleware'

const router = Router()

router.post('/bitbucket', webhookRateLimit, bitbucketWebhookController.handleBitbucket.bind(bitbucketWebhookController))

export default router