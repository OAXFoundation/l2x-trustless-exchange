// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

abstract class CustomError extends Error {
  protected constructor(message?: string) {
    super(message)

    this.name = Reflect.getPrototypeOf(this).constructor.name

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SignatureError)
    }
  }
}

export class ItemNotFoundError extends CustomError {
  constructor(message?: string) {
    super(message)
  }
}

export class OrderAlreadyClosedError extends CustomError {
  constructor(message?: string) {
    super(message)
  }
}

export class SignatureError extends CustomError {
  constructor(message?: string) {
    super(message)
  }
}

export class UnregisteredUserError extends CustomError {
  constructor(message?: string) {
    super(message)
  }
}

export class AuthorizationMessageValidationError extends CustomError {
  constructor(message?: string) {
    super(message)
  }
}

export class PrecisionError extends CustomError {
  constructor(message?: string) {
    super(message)
  }
}

export class RoundMismatchError extends CustomError {
  constructor(message?: string) {
    super(message)
  }
}

export class FeeUnpaidError extends CustomError {
  constructor(message?: string) {
    super(message)
  }
}

export class FeeWrongFormatError extends CustomError {
  constructor(message?: string) {
    super(message)
  }
}

export class WrongFeeStructureError extends CustomError {
  constructor(message?: string) {
    super(message)
  }
}

export class AmountError extends CustomError {
  constructor(message?: string) {
    super(message)
  }
}

export class InsufficientBalanceError extends CustomError {
  constructor(message?: string) {
    super(message)
  }
}

export class WrongInstanceIdError extends CustomError {
  constructor(message?: string) {
    super(message)
  }
}

export class AssetMismatchError extends CustomError {
  constructor(message?: string) {
    super(message)
  }
}

export class UnbackedFillError extends CustomError {
  constructor(message?: string) {
    super(message)
  }
}

export class InvalidSymbolError extends CustomError {
  constructor(message?: string) {
    super(message)
  }
}

// ------------------------------
// WITHDRAWAL ERRORS
// ------------------------------

export class DoubleWithdrawalError extends CustomError {
  constructor(message?: string) {
    super(message)
  }
}

export class NoActiveWithdrawalError extends CustomError {
  constructor(message?: string) {
    super(message)
  }
}

export class PrematureWithdrawalError extends CustomError {
  constructor(message?: string) {
    super(message)
  }
}

// ------------------------------
// AUDIT ERRORS
// ------------------------------

export class AuditError extends CustomError {
  constructor(message?: string) {
    super(message)
  }
}
