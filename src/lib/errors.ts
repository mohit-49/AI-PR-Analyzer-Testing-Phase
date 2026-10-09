export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR',
    public isOllamaDown?: boolean,
  ) { 
    super(message)
    this.name = 'AppError'
  }
}


export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR')
    this.name = 'ValidationError'
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND')
    this.name = 'NotFoundError'
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED')
    this.name = 'UnauthorizedError'
  }
}

export class BillingLimitError extends AppError {
  constructor(message: string = 'Plan limit reached. Please upgrade your plan.') {
    super(message, 402, 'BILLING_LIMIT_EXCEEDED')
    this.name = 'BillingLimitError'
  }
}
