import mongoose from 'mongoose'
import { env } from './env'
import { logger } from '../lib/logger'


}

mongoose.connection.on('disconnected', () => {
  isConnected = false
  logger.warn('MongoDB disconnected')
})