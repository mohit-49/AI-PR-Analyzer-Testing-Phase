// import { Router } from 'express'
// import { feedbackController } from '../controllers/feedback.controller'
// import { authMiddleware } from '../middleware/auth.middleware'

// const router = Router()

// router.use(authMiddleware)
// router.post('/', feedbackController.create.bind(feedbackController))
// router.get('/', feedbackController.listMine.bind(feedbackController))
// router.get('/:id', feedbackController.getOne.bind(feedbackController))
// router.delete('/:id', feedbackController.delete.bind(feedbackController))
// router.put('/:id', feedbackController.update.bind(feedbackController))

// export default router


import { Router } from 'express'
import { feedbackController } from '../controllers/feedback.controller'
import { authMiddleware } from '../middleware/auth.middleware'
import { uploadScreenshots } from '../middleware/feedback-upload.middleware'

const router = Router()

router.use(authMiddleware)
router.post('/', uploadScreenshots, feedbackController.create.bind(feedbackController))
router.get('/', feedbackController.listMine.bind(feedbackController))
router.get('/:id', feedbackController.getOne.bind(feedbackController))
router.delete('/:id', feedbackController.delete.bind(feedbackController))
router.put('/:id', uploadScreenshots, feedbackController.update.bind(feedbackController))

export default router