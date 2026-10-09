import { Router } from 'express'
import { adminController } from '@/controllers/admin/admin.controller'
import { authMiddleware } from '@/middleware/auth.middleware'
import { requireAdmin } from '@/middleware/admin/requireAdmin.middleware'

const router = Router()

router.use(authMiddleware, requireAdmin)

router.get('/dashboard', adminController.getDashboard.bind(adminController))

router.get('/users', adminController.listUsers.bind(adminController))
router.get('/repositories', adminController.listRepositories.bind(adminController))
router.get('/pull-requests', adminController.listPullRequests.bind(adminController))
router.get('/skill-files', adminController.listSkillFiles.bind(adminController))
router.get('/token-usage/overview', adminController.getTokenUsageOverview.bind(adminController))
router.get('/token-usage', adminController.listTokenUsage.bind(adminController))
router.get('/feedback', adminController.listFeedback.bind(adminController))
router.get('/feedback/:id', adminController.getFeedbackDetail.bind(adminController))
router.patch('/feedback/:id/status', adminController.updateFeedbackStatus.bind(adminController))
router.delete('/feedback/:id', adminController.deleteFeedback.bind(adminController))

export default router