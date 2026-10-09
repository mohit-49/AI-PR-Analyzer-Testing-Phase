import { Router } from 'express'
import multer from 'multer'
import { authController } from '../controllers/auth.controller'
import { authMiddleware } from '../middleware/auth.middleware'
import { ValidationError } from '../lib/errors'

const router = Router()

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(file.mimetype)) {
      cb(new ValidationError('Only JPG, PNG, or WEBP images are allowed') as any)
      return
    }
    cb(null, true)
  },
})

router.post('/github/callback', authController.githubCallback.bind(authController))
router.post('/bitbucket/callback', authController.bitbucketCallback.bind(authController))
router.get('/me', authMiddleware, authController.getMe.bind(authController))
router.put('/me/avatar', authMiddleware, avatarUpload.single('avatar'), authController.updateAvatar.bind(authController))
router.put('/me/profile', authMiddleware, authController.updateProfile.bind(authController))
router.put('/me/bitbucket-profile', authMiddleware, authController.updateBitbucketProfile.bind(authController))
router.post('/gitlab/callback', authController.gitlabCallback.bind(authController))

export default router