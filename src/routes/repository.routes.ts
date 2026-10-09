import { Router } from 'express'
import { repositoryController } from '../controllers/repository.controller'
import { authMiddleware } from '../middleware/auth.middleware' 

const router = Router()

router.use(authMiddleware)

router.get('/', repositoryController.list.bind(repositoryController))
router.get('/available', repositoryController.listAvailable.bind(repositoryController))
router.post('/connect', repositoryController.connect.bind(repositoryController))
router.delete('/:id', repositoryController.disconnect.bind(repositoryController))

router.get('/:id/details', repositoryController.getDetails.bind(repositoryController))
router.get('/:id/commits', repositoryController.getCommits.bind(repositoryController))

router.get('/summary', repositoryController.getSummary.bind(repositoryController))

export default router

