import multer from 'multer'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { Request, Response, NextFunction } from 'express'
import { ValidationError } from '../lib/errors'

// src/uploads/feedbackformss  (project root se chalane par dev aur prod dono me yahi folder)
export const FEEDBACK_UPLOAD_DIR = path.join(process.cwd(), 'src', 'uploads', 'feedbackformss')
export const FEEDBACK_PUBLIC_PATH = '/uploads/feedbackformss'
export const MAX_SCREENSHOTS = 5
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

const ALLOWED: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
}

fs.mkdirSync(FEEDBACK_UPLOAD_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, FEEDBACK_UPLOAD_DIR),
  // user ka file name kabhi use nahi karte (path traversal / overwrite se bachne ke liye)
  filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${ALLOWED[file.mimetype]}`),
})

const feedbackUpload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_SCREENSHOTS },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED[file.mimetype]) {
      return cb(new ValidationError('Only PNG, JPG or WEBP images are allowed'))
    }
    cb(null, true)
  },
})

// Multer ke errors ko apne ValidationError me badalta hai
export const uploadScreenshots = (req: Request, res: Response, next: NextFunction) => {
  feedbackUpload.array('screenshots', MAX_SCREENSHOTS)(req, res, (err: any) => {
    if (!err) return next()

    if (err instanceof multer.MulterError) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'Each screenshot must be under 5 MB'
          : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
            ? `You can upload up to ${MAX_SCREENSHOTS} screenshots`
            : 'Invalid upload'
      return next(new ValidationError(message))
    }
    next(err)
  })
}

// mimetype client bhejta hai, isliye file ke asli bytes bhi check karte hain
export async function hasImageSignature(filePath: string): Promise<boolean> {
  const fh = await fs.promises.open(filePath, 'r')
  try {
    const buf = Buffer.alloc(12)
    await fh.read(buf, 0, 12, 0)
    const png = buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    const jpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
    const webp = buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP'
    return png || jpg || webp
  } finally {
    await fh.close()
  }
}