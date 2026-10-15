// Application errors with a safe, user-facing message. Anything else that is
// thrown is treated as an internal error and its details are never shown.

export class AppError extends Error {
  constructor(
    public readonly publicMessage: string,
    public readonly status: number
  ) {
    super(publicMessage);
    this.name = new.target.name;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "You must be signed in.") {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You don't have permission to do that.") {
    super(message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "That record no longer exists.") {
    super(message, 404);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Some of the information entered is invalid.") {
    super(message, 400);
  }
}

export class ConflictError extends AppError {
  constructor(message = "That record already exists.") {
    super(message, 409);
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many attempts. Please wait a few minutes and try again.") {
    super(message, 429);
  }
}

export class DatabaseUnavailableError extends AppError {
  constructor(message = "The database is temporarily unavailable. Please try again shortly.") {
    super(message, 503);
  }
}
