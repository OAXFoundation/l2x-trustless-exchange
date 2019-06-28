// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ---------------------------------------------------------------------------

import { SOME_ADDRESS } from './SystemFixture'
import { IApproval } from '@oax/common/types/Approvals'
import { FillMediator, IFill, ISignedFill } from '@oax/common/types/Fills'
import { Identity } from '@oax/common/identity/Identity'

export async function mkFeeFromApproval(
  client: Identity,
  operator: Identity,
  approval: IApproval,
  fillSuffix: string
): Promise<ISignedFill> {
  const params: IFill = {
    fillId: `${approval.approvalId}${fillSuffix}`,
    approvalId: approval.approvalId,
    round: approval.round,
    buyAmount: approval.buy.amount,
    buyAsset: approval.buy.asset,
    sellAmount: approval.sell.amount,
    sellAsset: approval.sell.asset,
    clientAddress: client.address,
    instanceId: SOME_ADDRESS
  }

  const hash = FillMediator.fromIFill(params).createDigest()

  return {
    params: params,
    signature: await operator.signHash(hash)
  }
}
