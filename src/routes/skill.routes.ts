import { Router } from 'express'
import multer from 'multer'
import { skillController } from '../controllers/skill.controller'
import { authMiddleware } from '../middleware/auth.middleware'
import { ValidationError } from '../lib/errors'

const router = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 },
  fileFilter: (_req, file, cb) => {
    const isMarkdown = file.originalname.toLowerCase().endsWith('.md')
    if (!isMarkdown) {
      cb(new ValidationError('Only .md files are allowed') as any)
      return
    }
    cb(null, true)
  },
})

router.use(authMiddleware)

router.get('/summary', skillController.getSummary.bind(skillController))

router.get('/:repositoryId', skillController.getByRepo.bind(skillController))
router.put('/:repositoryId', skillController.update.bind(skillController))
router.get('/:repositoryId/versions', skillController.listVersions.bind(skillController))
router.put('/:repositoryId/versions/:skillId', skillController.updateVersion.bind(skillController))
router.post('/:repositoryId/upload', upload.single('file'), skillController.uploadFile.bind(skillController))
router.post('/:repositoryId/agent-generate', skillController.agentGenerate.bind(skillController))
router.delete('/:repositoryId/versions/:skillId', skillController.deleteVersion.bind(skillController))


export default router

