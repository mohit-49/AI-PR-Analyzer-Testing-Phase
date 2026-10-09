import { z } from 'zod'
import dotenv from 'dotenv'

dotenv.config()

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('5000').transform(Number),
  CORS_ORIGIN: z.string().url(),

  MONGODB_URI: z.string().min(1),
  MONGO_DB_NAME: z.string().min(1),

  JWT_SECRET: z.string().min(16),

  GROQ_API_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().optional(),

  ENCRYPTION_KEY: z.string().length(32),

  SENDGRID_API_KEY: z.string().min(1),
  FROM_EMAIL: z.string().email(),

  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  GITHUB_WEBHOOK_SECRET: z.string().min(1),

  BITBUCKET_CLIENT_ID: z.string().min(1),
  BITBUCKET_CLIENT_SECRET: z.string().min(1),

  GITLAB_CLIENT_ID: z.string().optional(),
  GITLAB_CLIENT_SECRET: z.string().optional(),
  GITLAB_REDIRECT_URI: z.string().optional(),

  CODECOMMIT_WEBHOOK_SECRET: z.string().min(32).optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().optional().default('ap-south-1'),

  // REDIS_URL: z.string().min(1),

  LLM_FAMILY: z.enum(['groq', 'ollama']).default('ollama'),
  OLLAMA_BASE_URL: z.string().optional(),
  OLLAMA_MODEL: z.string().optional(),
  OLLAMA_EMBEDDING_MODEL: z.string().optional(),
  OLLAMA_EMBEDDING_DIM: z.string().optional().transform((v) => (v ? Number(v) : undefined)),
  OLLAMA_NUM_CTX: z.string().optional().transform((v) => (v ? Number(v) : 50000)),
  OLLAMA_AGENT_MODEL: z.string().optional(),


  ADMIN_SEED_EMAIL: z.string(),
  ADMIN_SEED_PASSWORD: z.string(),

})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('Invalid environment variables:')
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data


