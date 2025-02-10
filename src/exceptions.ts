export type GombocErrorCode =
  | 'GENERIC'
  | 'NOT_FOUND'
  | 'INVALID_ARGUMENT'
  | 'UNAUTHORIZED';

export interface IGombocException {
  __typename: 'GombocError';
  message: string;
  stackTrace?: string | null;
  code: GombocErrorCode;
}

// export class GombocException extends Error implements IGombocException {
export class GombocException implements IGombocException {
  __typename: 'GombocError';
  message: string;
  stackTrace?: string | null;
  code: GombocErrorCode;

  constructor(message: string, stackTrace?: string | null) {
    this.__typename = 'GombocError';
    this.message = message;
    this.stackTrace = stackTrace;
    this.code = 'GENERIC';
  }
}

export class NotFoundError extends GombocException {
  constructor(message: string, stackTrace?: string | null) {
    super(message, stackTrace);
    this.code = 'NOT_FOUND';
  }
}

export class BadRequestError extends GombocException {
  constructor(message: string, stackTrace?: string | null) {
    super(message, stackTrace);
    this.code = 'INVALID_ARGUMENT';
  }
}

export class UnauthorizedError extends GombocException {
  constructor(message: string, stackTrace?: string | null) {
    super(message, stackTrace);
    this.code = 'UNAUTHORIZED';
  }
}

export class ServerError extends GombocException {
  constructor(message: string, stackTrace?: string | null) {
    super(message, stackTrace);
    this.code = 'GENERIC';
  }
}

// Zod validation errors
export class ParsingError extends GombocException {
  constructor(message: string, stackTrace?: string | null) {
    super(message, stackTrace);
  }
}

// Re-raise of errors coming from CfnAPI
export class InvalidTemplateError extends GombocException {
  constructor(message: string, stackTrace?: string | null) {
    super(message, stackTrace);
  }
}

// Re-raise of errors coming from CfnAPI
export class FailedRemediatingError extends GombocException {
  constructor(message: string, stackTrace?: string | null) {
    super(message, stackTrace);
  }
}

// Used for generic git errors
export class GitClientError extends GombocException {
  constructor(message: string, stackTrace?: string | null) {
    super(message, stackTrace);
  }
}

// Technically it's a git error, but this is more important because
// it's always fatal, while some git error like failing to add comments
// are not fatal for the remediation to happened
export class FailedApplyingRemediationError extends GombocException {
  constructor(message: string, stackTrace?: string | null) {
    super(message, stackTrace);
  }
}

export class FailedSavingScanResultsError extends GombocException {
  constructor(message: string, stackTrace?: string | null) {
    super(message, stackTrace);
  }
}

export class FailedSavingResultsError extends GombocException {
  constructor(message: string, stackTrace?: string | null) {
    super(message, stackTrace);
  }
}

/// Dynamo Exceptions
export class DynamoError extends GombocException {
  constructor(message: string, stackTrace?: string | null) {
    super(message, stackTrace);
  }
}

// For retrocompatibility -- These exceptions should become BadRequest and NotFound
// RepositoryNotLinkedError | NoPolicyFoundError | InvalidArgumentError

export class RepositoryNotLinkedError extends GombocException {
  constructor(message: string, stackTrace?: string | null) {
    super(message, stackTrace);
  }
}

export class NoPolicyFoundError extends GombocException {
  constructor(message: string, stackTrace?: string | null) {
    super(message, stackTrace);
  }
}

export class InvalidArgumentError extends GombocException {
  constructor(message: string, stackTrace?: string | null) {
    super(message, stackTrace);
    this.code = 'INVALID_ARGUMENT';
  }
}
