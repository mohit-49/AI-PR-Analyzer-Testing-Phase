import mongoose from 'mongoose'
import { env } from './env'
import { logger } from '../lib/logger'

let isConnected = false

export const connectDatabase = async (): Promise<void> => {
  if (isConnected) return
  try {
    await mongoose.connect(env.MONGODB_URI, {
      dbName: env.MONGO_DB_NAME,
    })
    isConnected = true
    logger.info('MongoDB connected successfully')
  } catch (error) {
    logger.error({ error }, 'MongoDB connection failed')
    process.exit(1)
  }
}

mongoose.connection.on('disconnected', () => {
  isConnected = false
  logger.warn('MongoDB disconnected')
})