import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { UserModel } from '../models/User.model'
import { env } from '../config/env'

// Run with: npx ts-node src/scripts/seed-admin.ts
// Reads credentials from env — never hardcode in source.
async function seedAdmin() {
  const email = process.env.ADMIN_SEED_EMAIL
  const password = process.env.ADMIN_SEED_PASSWORD

  if (!email || !password) {
    console.error('ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD must be set in the environment')
    process.exit(1)
  }

  if (password.length < 12) {
    console.error('ADMIN_SEED_PASSWORD must be at least 12 characters')
    process.exit(1)
  }

  await mongoose.connect(env.MONGODB_URI, { dbName: env.MONGO_DB_NAME })

  const existing = await UserModel.findOne({ email: email.toLowerCase() })
  if (existing) {
    if (existing.role === 'admin') {
      console.log(`Admin already exists for ${email} — nothing to do.`)
    } else {
      existing.role = 'admin'
      existing.passwordHash = await bcrypt.hash(password, 12)
      await existing.save()
      console.log(`Existing user ${email} promoted to admin.`)
    }
  } else {
    const passwordHash = await bcrypt.hash(password, 12)
    await UserModel.create({
      email: email.toLowerCase(),
      name: 'Admin',
      role: 'admin',
      passwordHash,
    })
    console.log(`Admin account created for ${email}.`)
  }

  await mongoose.disconnect()
  process.exit(0)
}

seedAdmin().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})