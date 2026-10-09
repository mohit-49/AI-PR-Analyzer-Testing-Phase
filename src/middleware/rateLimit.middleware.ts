import rateLimit from 'express-rate-limit' 

export const webhookRateLimit = rateLimit({
  windowMs: 60 * 1000, // webhookRateLimit → 1 minute m max 1000 webhook requests
  max: 1000,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many webhook requests' } },
  standardHeaders: true,
  legacyHeaders: false,
})

export const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // apiRateLimit → 15 minutes m max 200 API requests.
  max: 200,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
  standardHeaders: true,
  legacyHeaders: false,
})


export const adminLoginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // adminLoginRateLimit → 15 minutes m max 5 failed login attempts, brute-force attacks protection
  max: 5,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Try again later.' } },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
})