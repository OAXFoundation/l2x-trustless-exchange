// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import R from 'ramda'
import Ajv from 'ajv'
import BigNumber from 'bignumber.js'
import { ISignedFill } from './types/Fills'
import { ISignedApproval } from './types/Approvals'
import {
  IExchangeBalances,
  IOrder,
  IOrderBook,
  ITradeExternal
} from './types/ExchangeTypes'
import { D } from './BigNumberUtils'
import { IAuthorizationMessage } from './types/SmartContractTypes'

//////////////////////////////
// Type Definitions
//////////////////////////////

const SYMBOL_DEF = {
  type: 'string',
  pattern: '^\\w*\\/\\w*$'
}

const SIDE_DEF = {
  type: 'string',
  enum: ['buy', 'sell']
}

const ADDRESS_DEF = {
  type: 'string',
  pattern: '^0[xX][0-9a-zA-Z]{40}$'
}

const SIGNATURE_DEF = {
  type: 'string',
  pattern: '^0[xX][0-9a-zA-Z]{130}$'
}

//////////////////////////////
// Custom Validation
//////////////////////////////

const BIG_NUMBER_KEYWORD = 'BigNumber'

interface bigNumberSchema {
  checkPositive?: boolean
  checkNonNegative?: boolean
  checkLessThanOrEqualTo?: string
  checkEqualTo?: string
}

function amount(schema?: bigNumberSchema) {
  return {
    type: 'object',
    [BIG_NUMBER_KEYWORD]: schema || {}
  }
}

let bigNumberValidator: Ajv.SchemaValidateFunction
bigNumberValidator = (
  schema: bigNumberSchema,
  data: BigNumber,
  _parentSchema: any,
  dataPath: any
) => {
  bigNumberValidator.errors = bigNumberValidator.errors || []

  let result = true

  const addError = (message: string) => {
    bigNumberValidator.errors!.push({
      keyword: BIG_NUMBER_KEYWORD,
      dataPath: dataPath,
      schemaPath: `#/properties/price/${BIG_NUMBER_KEYWORD}`,
      params: { keyword: BIG_NUMBER_KEYWORD },
      message
    })

    result = false
  }

  if (!BigNumber.isBigNumber(data)) {
    addError(`${dataPath} is not a BigNumber. Given ${data}`)
    return false
  }

  const lte = schema.checkLessThanOrEqualTo
  if (lte) {
    const constraint = D(lte)
    if (!data.lte(constraint)) {
      addError(
        `${dataPath} should be less than or equal to ${constraint}. Given ${data}.`
      )
    }
  }

  if (schema.checkPositive) {
    if (!data.gt(0)) {
      addError(`${dataPath} should be positive. Given ${data}.`)
    }
  }

  if (schema.checkNonNegative) {
    if (!data.gte(0)) {
      addError(`${dataPath} should be non-negative. Given ${data}.`)
    }
  }

  if (schema.checkEqualTo) {
    const constraint = D(schema.checkEqualTo)
    if (!data.isEqualTo(constraint)) {
      addError(`${dataPath} should be equal to ${constraint}. Given ${data}.`)
    }
  }

  return result
}

const bigNumberKeyword: Ajv.KeywordDefinition = {
  validate: bigNumberValidator,
  errors: true
}

//////////////////////////////
// Schemas
//////////////////////////////

const schemas: object[] = []

export const authorizationSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'authorization',
  type: 'object',
  properties: {
    clientAddress: ADDRESS_DEF,
    round: {
      type: 'number'
    },
    sig: SIGNATURE_DEF
  },
  required: ['clientAddress', 'sig', 'round']
}
schemas.push(authorizationSchema)

export const orderBookSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'orderBook',
  description: 'An order book message from the API.',
  type: 'object',

  properties: {
    symbol: SYMBOL_DEF,
    level: {
      type: 'string',
      enum: ['L1', 'L2', 'L3']
    },
    bids: {
      type: 'array',
      items: {
        $ref: '#/definitions/PriceLevel'
      }
    },
    asks: {
      type: 'array',
      items: {
        $ref: '#/definitions/PriceLevel'
      }
    },
    timestamp: {
      type: 'number'
    },
    datetime: {
      type: 'string',
      format: 'date-time'
    }
  },

  required: ['symbol', 'level', 'bids', 'asks', 'timestamp', 'datetime'],

  definitions: {
    PriceLevel: {
      type: 'object',
      properties: {
        price: amount({ checkPositive: true }),
        amount: amount({ checkPositive: true })
      }
    }
  }
}
schemas.push(orderBookSchema)

export const tradeSchema = {
  $id: 'trade',
  $schema: 'http://json-schema.org/draft-07/schema#',
  description: 'A CCXT-like order message',
  type: 'object',
  properties: {
    info: {
      type: 'null'
    },
    id: {
      type: 'string'
    },
    timestamp: {
      type: 'number'
    },
    datetime: {
      type: 'string',
      format: 'date-time'
    },
    symbol: SYMBOL_DEF,
    order: {
      type: 'string'
    },
    type: {
      type: 'string',
      enum: ['limit', 'market']
    },
    side: SIDE_DEF,
    price: amount({ checkPositive: true }),
    amount: amount({ checkPositive: true }),
    cost: {
      type: 'number'
    }
  },

  required: [
    'id',
    'timestamp',
    'datetime',
    'symbol',
    'order',
    'type',
    'side',
    'price',
    'amount'
  ]
}
schemas.push(tradeSchema)

export const orderSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'order',
  type: 'object',
  properties: {
    id: {
      type: 'string'
    },
    datetime: {
      type: 'string',
      format: 'date-time'
    },
    timestamp: {
      type: 'number'
    },
    status: {
      type: 'string',
      enum: ['open', 'closed', 'canceled']
    },
    symbol: SYMBOL_DEF,
    type: {
      type: 'string',
      enum: ['limit']
    },
    side: SIDE_DEF,
    price: amount({ checkPositive: true }),
    amount: amount({ checkPositive: true }),
    filled: amount({ checkNonNegative: true }),
    remaining: amount({ checkNonNegative: true }),
    trades: {
      type: 'array',
      items: {
        $ref: 'trade'
      }
    }
  },
  required: [
    'id',
    'datetime',
    'timestamp',
    'status',
    'symbol',
    'type',
    'side',
    'price',
    'amount',
    'filled',
    'remaining',
    'trades'
  ]
}
schemas.push(orderSchema)

export const balancesSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'balances',
  type: 'object',
  patternProperties: {
    '.*': {
      type: 'object',
      properties: {
        free: amount({ checkNonNegative: true }),
        locked: amount({ checkNonNegative: true })
      },
      required: ['free', 'locked']
    }
  }
}
schemas.push(balancesSchema)

export const signedFillSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'signedFill',
  type: 'object',
  properties: {
    params: {
      type: 'object',
      properties: {
        fillId: {
          type: 'string'
        },
        approvalId: {
          type: 'string'
        },
        round: {
          type: 'number'
        },
        buyAmount: amount({
          checkNonNegative: true,
          checkLessThanOrEqualTo: '1e38'
        }),
        buyAsset: ADDRESS_DEF,
        sellAmount: amount({
          checkPositive: true,
          checkLessThanOrEqualTo: '1e38'
        }),
        sellAsset: ADDRESS_DEF,
        clientAddress: ADDRESS_DEF,
        instanceId: ADDRESS_DEF
      }
    },
    signature: SIGNATURE_DEF
  },
  required: ['params', 'signature']
}
schemas.push(signedFillSchema)

export const signedApprovalSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'signedApproval',
  type: 'object',
  properties: {
    params: {
      type: 'object',
      properties: {
        approvalId: {
          type: 'string'
        },
        round: {
          type: 'number'
        },
        buy: {
          type: 'object',
          properties: {
            asset: ADDRESS_DEF,
            amount: amount({
              checkPositive: true,
              checkLessThanOrEqualTo: '1e38'
            })
          },
          required: ['asset', 'amount']
        },
        sell: {
          type: 'object',
          properties: {
            asset: ADDRESS_DEF,
            amount: amount({
              checkPositive: true,
              checkLessThanOrEqualTo: '1e38'
            })
          },
          required: ['asset', 'amount']
        },
        intent: {
          type: 'string',
          enum: ['buyAll', 'sellAll']
        },
        owner: {
          type: 'string'
        },
        instanceId: ADDRESS_DEF
      },
      required: [
        'approvalId',
        'round',
        'buy',
        'sell',
        'intent',
        'owner',
        'instanceId'
      ]
    },
    ownerSig: SIGNATURE_DEF
  },
  required: ['params', 'ownerSig']
}
schemas.push(signedApprovalSchema)

export const signedFeeApprovalSchema = R.clone(signedApprovalSchema)
signedFeeApprovalSchema.$id = 'signedFee'
signedFeeApprovalSchema.properties.params.properties.buy = {
  type: 'object',
  properties: {
    asset: ADDRESS_DEF,
    amount: amount({
      checkEqualTo: '0'
    })
  },
  required: ['asset', 'amount']
}
schemas.push(signedFeeApprovalSchema)

export const apiErrorsSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'errors',
  type: 'object',
  required: ['errors'],
  properties: {
    errors: {
      type: 'array',
      items: {
        $ref: '#/definitions/error'
      },
      uniqueItems: true
    }
  },
  additionalProperties: false,
  definitions: {
    error: {
      type: 'object',
      properties: {
        id: {
          description:
            'A unique identifier for this particular occurrence of the problem.',
          type: 'string'
        },
        status: {
          description:
            'The HTTP status code applicable to this problem, expressed as a string value.',
          type: 'string'
        },
        code: {
          description:
            'An application-specific error code, expressed as a string value.',
          type: 'string'
        },
        title: {
          description:
            'A short, human-readable summary of the problem. It **SHOULD NOT** change from occurrence to occurrence of the problem, except for purposes of localization.',
          type: 'string'
        },
        detail: {
          description:
            'A human-readable explanation specific to this occurrence of the problem.',
          type: 'string'
        },
        source: {
          type: 'object',
          properties: {
            pointer: {
              description:
                'A JSON Pointer [RFC6901] to the associated entity in the request document [e.g. "/data" for a primary data object, or "/data/attributes/title" for a specific attribute].',
              type: 'string'
            },
            parameter: {
              description:
                'A string indicating which query parameter caused the error.',
              type: 'string'
            }
          }
        }
      },
      additionalProperties: false
    }
  }
}
schemas.push(apiErrorsSchema)

export namespace Validation {
  function validate(schemaRef: string, data: any) {
    const ajv = new Ajv({ schemas, allErrors: true })
    ajv.addKeyword(BIG_NUMBER_KEYWORD, bigNumberKeyword)

    if (!ajv.validate(schemaRef, data)) {
      throw Error(ajv.errorsText())
    }
  }

  export function validateAuthorization(data: IAuthorizationMessage) {
    validate('authorization', data)
  }

  export function validateOrderBook(data: IOrderBook) {
    validate('orderBook', data)
  }

  export function validateTrade(data: ITradeExternal) {
    validate('trade', data)
  }

  export function validateBalances(data: IExchangeBalances) {
    validate('balances', data)
  }

  export function validateOrder(data: IOrder) {
    validate('order', data)
  }

  export function validateSignedFill(data: ISignedFill) {
    validate('signedFill', data)
  }

  export function validateSignedApproval(data: ISignedApproval) {
    validate('signedApproval', data)
  }

  export function validateSignedFee(data: ISignedApproval) {
    validate('signedFee', data)
  }

  export function validateErrors(data: object) {
    validate('errors', data)
  }
}
