import { Router } from 'express'
import { adminAuthController } from '@/controllers/admin/admin-auth.controller'
import { adminLoginRateLimit } from '@/middleware/rateLimit.middleware'

const router = Router()

router.post('/login', adminLoginRateLimit, adminAuthController.login.bind(adminAuthController))

export default router