
import { Router } from 'express'
import { analysisController } from '../controllers/analysis.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

router.use(authMiddleware)

router.get('/summary', analysisController.getSummary.bind(analysisController))

router.get('/pr/:prId', analysisController.getByPR.bind(analysisController))
router.get('/all', analysisController.listAll.bind(analysisController))
router.get('/repository/:repoId', analysisController.listByRepo.bind(analysisController))
router.post('/pr/:prId/merge', analysisController.mergePR.bind(analysisController))
router.post('/pr/:prId/decline', analysisController.declinePR.bind(analysisController))

router.get('/notifications', analysisController.getNotifications.bind(analysisController))
router.post('/notifications/seen', analysisController.markSeen.bind(analysisController))

router.get('/repository/:repoId/count', analysisController.getRepoPRCount.bind(analysisController))
router.get('/repository/:repoId/pull-requests', analysisController.listRepoPullRequests.bind(analysisController))

export default router
