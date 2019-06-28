// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ---------------------------------------------------------------------------

const chaiPromises = require('chai-as-promised')
assert = require('assert')
Chai = require('chai')
Chai.use(chaiPromises)
assert    = Chai.assert


// GLOBAL STATE
var dispute                    = null
var totalDisputes              = 0
var disputeFills               = {}
var clientDeposits             = {}
var clientRequestedWithdrawals = {}


// TEST DATA
const tokenMap = {
   'eth' : 0,
   'oax' : 1
}

const tokenList = [
   'eth',
   'oax'
]

const dataList = [
   {
      description  : 'Basic working test',
      proofsBefore : { 'eth' : 5, 'oax' : 0 },
      proofsAfter  : { 'eth' : 0, 'oax' : 3 },
      deposits     : { 'eth' : 0, 'oax' : 0 },
      withdrawals  : { 'eth' : 0, 'oax' : 0 },
      approvals    : [
         { buyAmount : 3, buyAsset : 'oax', sellAmount : 5, sellAsset : 'eth', approvalId : 'a1', intent : true },
      ],
      fills        : [
         { buyAmount : 3, buyAsset : 'oax', sellAmount : 5, sellAsset : 'eth', approvalId : 'a1', fillId : 'f1', providedBy : 'both' },
      ],
      expected     : { open : true, close : true }
   },
   {
      description  : 'Nothing done',
      proofsBefore : { 'eth' : 5, 'oax' : 0 },
      proofsAfter  : { 'eth' : 5, 'oax' : 0 },
      deposits     : { 'eth' : 0, 'oax' : 0 },
      withdrawals  : { 'eth' : 0, 'oax' : 0 },
      approvals    : [
      ],
      fills        : [
      ],
      expected     : { open : true, close : true }
   },
   {
      description  : 'Nothing done, with approval',
      proofsBefore : { 'eth' : 5, 'oax' : 0 },
      proofsAfter  : { 'eth' : 5, 'oax' : 0 },
      deposits     : { 'eth' : 0, 'oax' : 0 },
      withdrawals  : { 'eth' : 0, 'oax' : 0 },
      approvals    : [
         { buyAmount : 3, buyAsset : 'oax', sellAmount : 5, sellAsset : 'eth', approvalId : 'a1', intent : true },
      ],
      fills        : [
      ],
      expected     : { open : true, close : false }
   },
   {
      description  : 'Partial fill',
      proofsBefore : { 'eth' : 6, 'oax' : 0 },
      proofsAfter  : { 'eth' : 0, 'oax' : 3 },
      deposits     : { 'eth' : 0, 'oax' : 0 },
      withdrawals  : { 'eth' : 0, 'oax' : 0 },
      approvals    : [
         { buyAmount : 3, buyAsset : 'oax', sellAmount : 6, sellAsset : 'eth', approvalId : 'a1', intent : true },
         { buyAmount : 3, buyAsset : 'oax', sellAmount : 6, sellAsset : 'eth', approvalId : 'a1', intent : true },
      ],
      fills        : [
         { buyAmount : 2, buyAsset : 'oax', sellAmount : 4, sellAsset : 'eth', approvalId : 'a1', fillId : 'f1', providedBy : 'both' },
         { buyAmount : 1, buyAsset : 'oax', sellAmount : 2, sellAsset : 'eth', approvalId : 'a1', fillId : 'f2', providedBy : 'both' },
      ],
      expected     : { open : true, close : true }
   },
   {
      description  : 'Partial fill - Based on CloseBalanceDispute tests.',
      proofsBefore : { 'eth' : 100, 'oax' : 100 },
      proofsAfter  : { 'eth' : 94, 'oax' : 151 },
      deposits     : { 'eth' : 0, 'oax' : 0 },
      withdrawals  : { 'eth' : 0, 'oax' : 0 },
      approvals    : [
         { buyAmount : 60, buyAsset : 'eth', sellAmount : 15, sellAsset : 'oax', approvalId : 'a1', intent : true },
         { buyAmount : 60, buyAsset : 'eth', sellAmount : 15, sellAsset : 'oax', approvalId : 'a1', intent : true },
         { buyAmount : 48, buyAsset : 'oax', sellAmount : 16, sellAsset : 'eth', approvalId : 'a2', intent : false },
         { buyAmount : 48, buyAsset : 'oax', sellAmount : 16, sellAsset : 'eth', approvalId : 'a2', intent : false },
         { buyAmount : 48, buyAsset : 'oax', sellAmount : 16, sellAsset : 'eth', approvalId : 'a2', intent : false },
         { buyAmount : 10, buyAsset : 'oax', sellAmount : 50, sellAsset : 'eth', approvalId : 'a3', intent : false },
      ],
      fills        : [
         { buyAmount : 20, buyAsset : 'eth', sellAmount : 4,  sellAsset : 'oax', approvalId : 'a1', fillId : 'f1', providedBy : 'both' },
         { buyAmount : 40, buyAsset : 'eth', sellAmount : 10, sellAsset : 'oax', approvalId : 'a1', fillId : 'f2', providedBy : 'both' },
         { buyAmount : 20, buyAsset : 'oax', sellAmount : 5,  sellAsset : 'eth', approvalId : 'a2', fillId : 'f3', providedBy : 'both' },
         { buyAmount : 17, buyAsset : 'oax', sellAmount : 5,  sellAsset : 'eth', approvalId : 'a2', fillId : 'f4', providedBy : 'both' },
         { buyAmount : 18, buyAsset : 'oax', sellAmount : 6,  sellAsset : 'eth', approvalId : 'a2', fillId : 'f5', providedBy : 'both' },
         { buyAmount : 10, buyAsset : 'oax', sellAmount : 50, sellAsset : 'eth', approvalId : 'a3', fillId : 'f6', providedBy : 'both' },
      ],
      expected     : { open : true, close : true }
   },
   {
      description  : 'Intent == buy | buy =, sell <',
      proofsBefore : { 'eth' : 6, 'oax' : 0 },
      proofsAfter  : { 'eth' : 1, 'oax' : 3 },
      deposits     : { 'eth' : 0, 'oax' : 0 },
      withdrawals  : { 'eth' : 0, 'oax' : 0 },
      approvals    : [
         { buyAmount : 3, buyAsset : 'oax', sellAmount : 6, sellAsset : 'eth', approvalId : 'a1', intent : true },
      ],
      fills        : [
         { buyAmount : 3, buyAsset : 'oax', sellAmount : 5, sellAsset : 'eth', approvalId : 'a1', fillId : 'f1', providedBy : 'both' },
      ],
      expected     : { open : true, close : true }
   },
   {
      description  : 'Intent == buy | buy <, sell <',
      proofsBefore : { 'eth' : 6, 'oax' : 0 },
      proofsAfter  : { 'eth' : 5, 'oax' : 2 },
      deposits     : { 'eth' : 0, 'oax' : 0 },
      withdrawals  : { 'eth' : 0, 'oax' : 0 },
      approvals    : [
         { buyAmount : 3, buyAsset : 'oax', sellAmount : 6, sellAsset : 'eth', approvalId : 'a1', intent : true },
      ],
      fills        : [
         { buyAmount : 2, buyAsset : 'oax', sellAmount : 1, sellAsset : 'eth', approvalId : 'a1', fillId : 'f1', providedBy : 'both' },
      ],
      expected     : { open : true, close : true }
   },
   {
      description  : 'Intent == buy | buy >, sell = (should fail)',
      proofsBefore : { 'eth' : 3, 'oax' : 0 },
      proofsAfter  : { 'eth' : 0, 'oax' : 7 },
      deposits     : { 'eth' : 0, 'oax' : 0 },
      withdrawals  : { 'eth' : 0, 'oax' : 0 },
      approvals    : [
         { buyAmount : 6, buyAsset : 'oax', sellAmount : 3, sellAsset : 'eth', approvalId : 'a1', intent : true },
      ],
      fills        : [
         { buyAmount : 7, buyAsset : 'oax', sellAmount : 3, sellAsset : 'eth', approvalId : 'a1', fillId : 'f1', providedBy : 'both' },
      ],
      expected     : { open : true, close : false }
   },
   {
      description  : 'Intent == buy | buy >, sell < (should fail)',
      proofsBefore : { 'eth' : 3, 'oax' : 0 },
      proofsAfter  : { 'eth' : 2, 'oax' : 7 },
      deposits     : { 'eth' : 0, 'oax' : 0 },
      withdrawals  : { 'eth' : 0, 'oax' : 0 },
      approvals    : [
         { buyAmount : 6, buyAsset : 'oax', sellAmount : 3, sellAsset : 'eth', approvalId : 'a1', intent : true },
      ],
      fills        : [
         { buyAmount : 7, buyAsset : 'oax', sellAmount : 1, sellAsset : 'eth', approvalId : 'a1', fillId : 'f1', providedBy : 'both' },
      ],
      expected     : { open : true, close : false }
   },
   {
      description  : 'Intent == sell | buy =, sell=',
      proofsBefore : { 'eth' : 6, 'oax' : 0 },
      proofsAfter  : { 'eth' : 0, 'oax' : 3 },
      deposits     : { 'eth' : 0, 'oax' : 0 },
      withdrawals  : { 'eth' : 0, 'oax' : 0 },
      approvals    : [
         { buyAmount : 3, buyAsset : 'oax', sellAmount : 6, sellAsset : 'eth', approvalId : 'a1', intent : false },
      ],
      fills        : [
         { buyAmount : 3, buyAsset : 'oax', sellAmount : 6, sellAsset : 'eth', approvalId : 'a1', fillId : 'f1', providedBy : 'both' },
      ],
      expected     : { open : true, close : true }
   },
   {
      description  : 'Intent == sell | buy >, sell=',
      proofsBefore : { 'eth' : 8, 'oax' : 0 },
      proofsAfter  : { 'eth' : 2, 'oax' : 7 },
      deposits     : { 'eth' : 0, 'oax' : 0 },
      withdrawals  : { 'eth' : 0, 'oax' : 0 },
      approvals    : [
         { buyAmount : 3, buyAsset : 'oax', sellAmount : 6, sellAsset : 'eth', approvalId : 'a1', intent : false },
      ],
      fills        : [
         { buyAmount : 7, buyAsset : 'oax', sellAmount : 6, sellAsset : 'eth', approvalId : 'a1', fillId : 'f1', providedBy : 'both' },
      ],
      expected     : { open : true, close : true }
   },
   {
      description  : 'Intent == sell | buy >, sell<',
      proofsBefore : { 'eth' : 8, 'oax' : 0 },
      proofsAfter  : { 'eth' : 3, 'oax' : 7 },
      deposits     : { 'eth' : 0, 'oax' : 0 },
      withdrawals  : { 'eth' : 0, 'oax' : 0 },
      approvals    : [
         { buyAmount : 3, buyAsset : 'oax', sellAmount : 6, sellAsset : 'eth', approvalId : 'a1', intent : false },
      ],
      fills        : [
         { buyAmount : 7, buyAsset : 'oax', sellAmount : 5, sellAsset : 'eth', approvalId : 'a1', fillId : 'f1', providedBy : 'both' },
      ],
      expected     : { open : true, close : true }
   },
   {
      description  : 'Intent == sell | buy =, sell>',
      proofsBefore : { 'eth' : 8, 'oax' : 0 },
      proofsAfter  : { 'eth' : 3, 'oax' : 3 },
      deposits     : { 'eth' : 0, 'oax' : 0 },
      withdrawals  : { 'eth' : 0, 'oax' : 0 },
      approvals    : [
         { buyAmount : 3, buyAsset : 'oax', sellAmount : 6, sellAsset : 'eth', approvalId : 'a1', intent : false },
      ],
      fills        : [
         { buyAmount : 3, buyAsset : 'oax', sellAmount : 7, sellAsset : 'eth', approvalId : 'a1', fillId : 'f1', providedBy : 'both' },
      ],
      expected     : { open : true, close : false }
   },
   {
      description  : 'With a eth deposit',
      proofsBefore : { 'eth' : 5, 'oax' : 0 },
      proofsAfter  : { 'eth' : 2, 'oax' : 3 },
      deposits     : { 'eth' : 2, 'oax' : 0 },
      withdrawals  : { 'eth' : 0, 'oax' : 0 },
      approvals    : [
         { buyAmount : 3, buyAsset : 'oax', sellAmount : 5, sellAsset : 'eth', approvalId : 'a1', intent : true },
      ],
      fills        : [
         { buyAmount : 3, buyAsset : 'oax', sellAmount : 5, sellAsset : 'eth', approvalId : 'a1', fillId : 'f1', providedBy : 'both' },
      ],
      expected     : { open : true, close : true }
   },
   {
      description  : 'With a oax deposit',
      proofsBefore : { 'eth' : 5, 'oax' : 0 },
      proofsAfter  : { 'eth' : 0, 'oax' : 4 },
      deposits     : { 'eth' : 0, 'oax' : 1 },
      withdrawals  : { 'eth' : 0, 'oax' : 0 },
      approvals    : [
         { buyAmount : 3, buyAsset : 'oax', sellAmount : 5, sellAsset : 'eth', approvalId : 'a1', intent : true },
      ],
      fills        : [
         { buyAmount : 3, buyAsset : 'oax', sellAmount : 5, sellAsset : 'eth', approvalId : 'a1', fillId : 'f1', providedBy : 'both' },
      ],
      expected     : { open : true, close : true }
   },
   {
      description  : 'With a eth withdrawal',
      proofsBefore : { 'eth' : 8, 'oax' : 0 },
      proofsAfter  : { 'eth' : 1, 'oax' : 3 },
      deposits     : { 'eth' : 0, 'oax' : 0 },
      withdrawals  : { 'eth' : 2, 'oax' : 0 },
      approvals    : [
         { buyAmount : 3, buyAsset : 'oax', sellAmount : 5, sellAsset : 'eth', approvalId : 'a1', intent : true },
      ],
      fills        : [
         { buyAmount : 3, buyAsset : 'oax', sellAmount : 5, sellAsset : 'eth', approvalId : 'a1', fillId : 'f1', providedBy : 'both' },
      ],
      expected     : { open : true, close : true }
   },
   {
      description  : 'With a oax withdrawal',
      proofsBefore : { 'eth' : 8, 'oax' : 2 },
      proofsAfter  : { 'eth' : 3, 'oax' : 1 },
      deposits     : { 'eth' : 0, 'oax' : 0 },
      withdrawals  : { 'eth' : 0, 'oax' : 4 },
      approvals    : [
         { buyAmount : 3, buyAsset : 'oax', sellAmount : 5, sellAsset : 'eth', approvalId : 'a1', intent : true },
      ],
      fills        : [
         { buyAmount : 3, buyAsset : 'oax', sellAmount : 5, sellAsset : 'eth', approvalId : 'a1', fillId : 'f1', providedBy : 'both' },
      ],
      expected     : { open : true, close : true }
   },
   {
      description  : 'With a eth,oax deposit and withdrawal',
      proofsBefore : { 'eth' : 8, 'oax' : 2 },
      proofsAfter  : { 'eth' : 8, 'oax' : 4 },
      deposits     : { 'eth' : 7, 'oax' : 3 },
      withdrawals  : { 'eth' : 2, 'oax' : 4 },
      approvals    : [
         { buyAmount : 3, buyAsset : 'oax', sellAmount : 5, sellAsset : 'eth', approvalId : 'a1', intent : true },
      ],
      fills        : [
         { buyAmount : 3, buyAsset : 'oax', sellAmount : 5, sellAsset : 'eth', approvalId : 'a1', fillId : 'f1', providedBy : 'both' },
      ],
      expected     : { open : true, close : true }
   },
   {
      description  : 'Multiple approvals and fills, one way',
      proofsBefore : { 'eth' : 8, 'oax' : 0 },
      proofsAfter  : { 'eth' : 0, 'oax' : 6 },
      deposits     : { 'eth' : 0, 'oax' : 0 },
      withdrawals  : { 'eth' : 0, 'oax' : 0 },
      approvals    : [
         { buyAmount : 3, buyAsset : 'oax', sellAmount : 1, sellAsset : 'eth', approvalId : 'a1', intent : true },
         { buyAmount : 1, buyAsset : 'oax', sellAmount : 1, sellAsset : 'eth', approvalId : 'a2', intent : true },
         { buyAmount : 2, buyAsset : 'oax', sellAmount : 6, sellAsset : 'eth', approvalId : 'a3', intent : true },
         { buyAmount : 2, buyAsset : 'oax', sellAmount : 6, sellAsset : 'eth', approvalId : 'a3', intent : true },
      ],
      fills        : [
         { buyAmount : 3, buyAsset : 'oax', sellAmount : 1, sellAsset : 'eth', approvalId : 'a1', fillId : 'f1', providedBy : 'both' },
         { buyAmount : 1, buyAsset : 'oax', sellAmount : 1, sellAsset : 'eth', approvalId : 'a2', fillId : 'f2', providedBy : 'both' },
         { buyAmount : 1, buyAsset : 'oax', sellAmount : 3, sellAsset : 'eth', approvalId : 'a3', fillId : 'f3', providedBy : 'both' },
         { buyAmount : 1, buyAsset : 'oax', sellAmount : 3, sellAsset : 'eth', approvalId : 'a3', fillId : 'f4', providedBy : 'both' },
      ],
      expected     : { open : true, close : true }
   },
   {
      description  : 'Multiple approvals and fills, both ways',
      proofsBefore : { 'eth' : 8, 'oax' : 0 },
      proofsAfter  : { 'eth' : 3, 'oax' : 4 },
      deposits     : { 'eth' : 0, 'oax' : 0 },
      withdrawals  : { 'eth' : 0, 'oax' : 0 },
      approvals    : [
         { buyAmount : 3, buyAsset : 'oax', sellAmount : 1, sellAsset : 'eth', approvalId : 'a1', intent : true },
         { buyAmount : 1, buyAsset : 'eth', sellAmount : 1, sellAsset : 'oax', approvalId : 'a2', intent : true },
         { buyAmount : 1, buyAsset : 'oax', sellAmount : 1, sellAsset : 'eth', approvalId : 'a3', intent : true },
         { buyAmount : 2, buyAsset : 'oax', sellAmount : 6, sellAsset : 'eth', approvalId : 'a4', intent : true },
         { buyAmount : 2, buyAsset : 'oax', sellAmount : 6, sellAsset : 'eth', approvalId : 'a4', intent : true },
         { buyAmount : 2, buyAsset : 'eth', sellAmount : 1, sellAsset : 'oax', approvalId : 'a5', intent : true },
      ],
      fills        : [
         { buyAmount : 3, buyAsset : 'oax', sellAmount : 1, sellAsset : 'eth', approvalId : 'a1', fillId : 'f1', providedBy : 'both' },
         { buyAmount : 1, buyAsset : 'eth', sellAmount : 1, sellAsset : 'oax', approvalId : 'a2', fillId : 'f2', providedBy : 'both' },
         { buyAmount : 1, buyAsset : 'oax', sellAmount : 1, sellAsset : 'eth', approvalId : 'a3', fillId : 'f3', providedBy : 'both' },
         { buyAmount : 1, buyAsset : 'oax', sellAmount : 3, sellAsset : 'eth', approvalId : 'a4', fillId : 'f4', providedBy : 'both' },
         { buyAmount : 1, buyAsset : 'oax', sellAmount : 3, sellAsset : 'eth', approvalId : 'a4', fillId : 'f5', providedBy : 'both' },
         { buyAmount : 2, buyAsset : 'eth', sellAmount : 1, sellAsset : 'oax', approvalId : 'a5', fillId : 'f6', providedBy : 'both' },
      ],
      expected     : { open : true, close : true }
   },
   {
      description  : 'Multiple approvals and fills, going into negative',
      proofsBefore : { 'eth' : 8, 'oax' : 0 },
      proofsAfter  : { 'eth' : 8, 'oax' : 1 },
      deposits     : { 'eth' : 0, 'oax' : 0 },
      withdrawals  : { 'eth' : 0, 'oax' : 0 },
      approvals    : [
         { buyAmount : 1, buyAsset : 'eth', sellAmount : 2, sellAsset : 'oax', approvalId : 'a1', intent : true },
         { buyAmount : 3, buyAsset : 'oax', sellAmount : 1, sellAsset : 'eth', approvalId : 'a2', intent : true },
      ],
      fills        : [
         { buyAmount : 1, buyAsset : 'eth', sellAmount : 2, sellAsset : 'oax', approvalId : 'a1', fillId : 'f1', providedBy : 'both' },
         { buyAmount : 3, buyAsset : 'oax', sellAmount : 1, sellAsset : 'eth', approvalId : 'a2', fillId : 'f2', providedBy : 'both' },
      ],
      expected     : { open : true, close : false }
   },
   {
      description  : 'Non-contiguous duplicated approvals',
      proofsBefore : { 'eth' : 5, 'oax' : 0 },
      proofsAfter  : { 'eth' : 0, 'oax' : 5 },
      deposits     : { 'eth' : 0, 'oax' : 0 },
      withdrawals  : { 'eth' : 0, 'oax' : 0 },
      approvals    : [
         { buyAmount : 1, buyAsset : 'oax', sellAmount : 1, sellAsset : 'eth', approvalId : 'a1', intent : true },
         { buyAmount : 1, buyAsset : 'oax', sellAmount : 1, sellAsset : 'eth', approvalId : 'a2', intent : true },
         { buyAmount : 1, buyAsset : 'oax', sellAmount : 1, sellAsset : 'eth', approvalId : 'a1', intent : true },
         { buyAmount : 1, buyAsset : 'oax', sellAmount : 1, sellAsset : 'eth', approvalId : 'a2', intent : true },
         { buyAmount : 1, buyAsset : 'oax', sellAmount : 1, sellAsset : 'eth', approvalId : 'a1', intent : true },
      ],
      fills        : [
         { buyAmount : 1, buyAsset : 'oax', sellAmount : 1, sellAsset : 'eth', approvalId : 'a1', fillId : 'f1', providedBy : 'both' },
         { buyAmount : 1, buyAsset : 'oax', sellAmount : 1, sellAsset : 'eth', approvalId : 'a2', fillId : 'f2', providedBy : 'both' },
         { buyAmount : 1, buyAsset : 'oax', sellAmount : 1, sellAsset : 'eth', approvalId : 'a1', fillId : 'f3', providedBy : 'both' },
         { buyAmount : 1, buyAsset : 'oax', sellAmount : 1, sellAsset : 'eth', approvalId : 'a2', fillId : 'f4', providedBy : 'both' },
         { buyAmount : 1, buyAsset : 'oax', sellAmount : 1, sellAsset : 'eth', approvalId : 'a1', fillId : 'f5', providedBy : 'both' },
      ],
      expected     : { open : true, close : false }
   },
]


async function run() {

   for (var i = 0; i < dataList.length; i++) {
      const data = dataList[i]
      restoreState(data)

      console.log('------------------------------------------------------------------------------')
      console.log('Test ' + (i + 1) + ' - ' + data.description)
      console.log('------------------------------------------------------------------------------')

      // openDispute
      //
      process.stdout.write('Opening Dispute... ')

      var error = null
      try {
         const proofs = makeProofs(data.proofsBefore)
         const fills  = data.fills.filter(o => o.providedBy == 'both' || o.providedBy == 'client')
         openDispute(proofs, fills)
      } catch (e) { error = e }

      assertAsExpected('open', data.expected.open, error)

      // closeDispute
      //
      process.stdout.write('Closing Dispute... ')
      error = null
      try {
         const proofs = makeProofs(data.proofsAfter)
         const fills  = data.fills.filter(o => o.providedBy == 'both' || o.providedBy == 'operator')
         //closeDispute(proofs, data.approvals, fills)
         closeDispute2(proofs, data.approvals, fills)
      } catch (e) { error = e }

      assertAsExpected('close', data.expected.close, error)
      console.log('')
   }
}






// ==========
//  MEDIATOR
// ==========

/*
struct Proof {
    uint256 clientOpeningBalance;
    address tokenAddress;
}

struct Approval {
    uint256 approvalId;
    uint256 buyAmount;
    address buyAsset;
    uint256 sellAmount;
    address sellAsset;
    bool intent; // true: buy, false: sell
}

struct Fill {
    uint256 fillId;
    uint256 approvalId;
    uint256 buyAmount;
    address buyAsset;
    uint256 sellAmount;
    address sellAsset;
}
*/


function openDispute(proofs, fills) {

   if (dispute && dispute.open) {
       return false
   }

   var openingBalancesClient = new Array(tokenList.length)

   if (proofs.length > 0) {
       assert(isProofArrayValid(proofs))

       for (var i = 0; i < proofs.length; i++) {
           openingBalancesClient[i] = proofs[i].clientOpeningBalance
       }
   } else {
       assert.fail('Need proofs')
   }

   const disputeId = totalDisputes + 1

   if (fills.length > 0) {
       for (var i = 0; i < fills.length; i++) {
           // Put the fill in storage as it will be needed by closeDispute.
           if (!disputeFills[disputeId]) {
              disputeFills[disputeId] = {}
           }

           disputeFills[disputeId][fills[i].fillId] = fills[i]
       }

       // Check if all fills are ordered and unique.
       for (var i = 0; i < fills.length - 1; i++) {
           assert(fills[i].fillId < fills[i + 1].fillId, 'Fill IDs must be unique and ordered');
       }
   }

   dispute = {
      disputeId : disputeId,
      openingBalances :  openingBalancesClient,
      fillCount : fills.length,
      open : true
   }

   totalDisputes = disputeId

   return true
}


function closeDispute(proofs, approvals, fills) {
   assert(dispute.open)

   // Check the proofs
   assert(isProofArrayValid(proofs))

   // Check that all fills are unique.
   if (fills.length > 1) {
       for (var i = 0; i < fills.length - 1; i++) {
           assert(fills[i].fillId < fills[i + 1].fillId)
       }
   }

   // Check all the fills of dispute are included.
   var fillCount = 0
   for (var i = 0; i < fills.length; i++) {
      const clientFill = disputeFills[dispute.disputeId][fills[i].fillId]

      if (clientFill && areFillsEqual(fills[i], clientFill)) {
          fillCount += 1
      }
   }
   assert(fillCount == dispute.fillCount)

   checkFillWithApproval(approvals, fills)

   const changes = computeBalanceChangePerApproval(approvals, fills)
   checkAllFillsCovered(approvals, changes)

   compareBalancesDispute(
       fills,
       proofs
   )

   // Close the dispute
   dispute.open = false
}


function closeDispute2(proofs, approvals, fills) {
   assert(dispute.open)

   // Check the proofs
   assert(isProofArrayValid(proofs))

   // Check that all fills are unique.
   if (fills.length > 1) {
       for (var i = 0; i < fills.length - 1; i++) {
           assert(fills[i].fillId < fills[i + 1].fillId)
       }
   }

   // Check all the fills of dispute are included.
   var fillCount = 0
   for (var i = 0; i < fills.length; i++) {
      const clientFill = disputeFills[dispute.disputeId][fills[i].fillId]

      if (clientFill && areFillsEqual(fills[i], clientFill)) {
          fillCount += 1
      }
   }
   assert(fillCount == dispute.fillCount)

   // Check approvals match with fills
   checkFillWithApproval(approvals, fills)

   var balances = {}
   for (var i = 0; i < dispute.openingBalances.length; i++) {
      balances[tokenList[i]] = dispute.openingBalances[i]
   }
   console.log('')
   console.log('Initial balances')
   console.log(balances)
   console.log('')

   for (var i = 0; i < tokenList.length; i++) {
      const token = tokenList[i]

      if (clientDeposits[token]) {
         balances[token] += clientDeposits[token]
      }

      assert(balances[token] >= 0)
   }
   console.log('Initial balances after deposit/withrawal')
   console.log(balances)
   console.log('')

   var approvedBuy  = { eth : 0, oax : 0 }
   var approvedSell = { eth : 0, oax : 0 }
   var didProcess = {}
   for (var i = 0; i < approvals.length; i++) {
      const approval = approvals[i]

      if (didProcess[approval.approvalId]) {
         continue
      }

      if (approval.intent) {
         approvedBuy[approval.buyAsset] += approval.buyAmount
      }

      approvedSell[approval.sellAsset] += approval.sellAmount

      didProcess[approval.approvalId] = true
   }
   console.log('Approved Buys')
   console.log(approvedBuy)
   console.log('')
   console.log('Approved Sells')
   console.log(approvedSell)
   console.log('')
   for (var i = 0; i < fills.length; i++) {
      const fill = fills[i]
      const approval = approvals[i]

      if (approval.intent) {
          if (fill.buyAmount > approval.buyAmount) {
             throw new Error('Bought more than approved amount.')
          }

          approvedBuy[fill.buyAsset] -= fill.buyAmount
      } else {
          if (fill.sellAmount > approval.sellAmount) {
             throw new Error('Sold more than approved amount.')
          }
      }

      approvedSell[fill.sellAsset] -= fill.sellAmount

      balances[fill.buyAsset]  += fill.buyAmount
      balances[fill.sellAsset] -= fill.sellAmount

      //console.log(balances[fill.buyAsset])
      //console.log(balances[fill.sellAsset])
      //console.log(approvedBuy[fill.buyAsset])
      //console.log(approvedSell[fill.sellAsset])
      if (balances[fill.buyAsset] < 0) { throw new Error('balances[fill.buyAsset] < 0') }
      if (balances[fill.sellAsset] < 0) { throw new Error('balances[fill.sellAsset] < 0') }
      if (approvedBuy[fill.buyAsset] < 0) { throw new Error('approvedBuy[fill.buyAsset] < 0') }
      if (approvedSell[fill.sellAsset] < 0) { throw new Error('approvedSell[fill.sellAsset] < 0') }
   }

   for (var i = 0; i < tokenList.length; i++) {
      const token = tokenList[i]

      if (clientRequestedWithdrawals[token]) {
         balances[token] -= clientRequestedWithdrawals[token]
      }
      assert(balances[token] >= 0)
   }

   console.log('--- Final ---')
   console.log('Balances')
   console.log(balances)
   console.log('')
   console.log('Approved Buy')
   console.log(approvedBuy)
   console.log('')
   console.log('Approved Sell')
   console.log(approvedSell)
   console.log('')

   for (var i = 0; i < proofs.length; i++) {
      const proof = proofs[i]
      const expected = proofs[i].clientOpeningBalance
      const actual   = balances[proof.tokenAddress]
      assert.equal(expected, actual)
   }
   /*
   checkFillWithApproval(approvals, fills)

   const changes = computeBalanceChangePerApproval(approvals, fills)
   checkAllFillsCovered(approvals, changes)

   compareBalancesDispute(
       fills,
       proofs
   )
   */
   // Close the dispute
   dispute.open = false
}


function computeBalancesInducedByFills(fills) {

    var balances = []
    for (var i = 0; i < tokenList.length; i++) {
       balances.push(0)
    }

    for (var i = 0; i < fills.length ; i++) {
        balances[tokenMap[fills[i].buyAsset]] += fills[i].buyAmount
        balances[tokenMap[fills[i].sellAsset]] -= fills[i].sellAmount
    }

    return balances
}


function compareBalancesDispute(fills, proofs) {
    var fillsInducedBalances = computeBalancesInducedByFills(fills)
    var openingBalancesBeforeDispute = dispute.openingBalances

    for (var i = 0; i < tokenList.length; i++) {
        const tokenAddress = tokenList[i]

        // Check if there is a withdrawal.
        var withdrawalAmount = 0
        if (clientRequestedWithdrawals[tokenAddress]) {
            withdrawalAmount = clientRequestedWithdrawals[tokenAddress]
        }

        var expectedBalance = null
        const depositAmount = clientDeposits[tokenAddress]

        // Need to make the conversion from int256 to uint256 before adding/subtracting.
        if (fillsInducedBalances[i] >= 0) {
            assert(fillsInducedBalances[i] >= 0)
            expectedBalance = openingBalancesBeforeDispute[i] + fillsInducedBalances[i]
        } else {
            assert(fillsInducedBalances[i] <= 0)
            expectedBalance = openingBalancesBeforeDispute[i] - (-1 * fillsInducedBalances[i])
        }

        expectedBalance = expectedBalance - withdrawalAmount
        expectedBalance = expectedBalance + depositAmount

        const newOpeningBalance = proofs[i].clientOpeningBalance

        assert(newOpeningBalance == expectedBalance, 'Not allowed to close dispute')
    }

    return true
}


function areFillsEqual(fill1, fill2) {
    return (
        fill1.fillId === fill2.fillId &&
        fill1.approvalId === fill2.approvalId &&
        fill1.buyAmount === fill2.buyAmount &&
        fill1.buyAsset === fill2.buyAsset &&
        fill1.sellAmount === fill2.sellAmount &&
        fill1.sellAsset === fill2.sellAsset
    )
}


function checkFillWithApproval(approvals, fills) {
    assert(fills.length == approvals.length)

    // Check the relation between each approval and fill.
    for (var i = 0; i < approvals.length; i++) {
        const approval = approvals[i]
        const fill = fills[i]

        assert(fill.approvalId === approval.approvalId)
        assert(fill.buyAsset   === approval.buyAsset)
        assert(fill.sellAsset  === approval.sellAsset)

        // Avoid division by zero if buyAmount == 0 which could be a legitimate value,
        // for instance if the approval is used to pay a fee.

        // No price restriction.
        if (approval.buyAmount === 0) {
            continue
        }

        // If the approval buyAmount is non-zero the fill buyAmount must be non-zero too.
        assert(fill.buyAmount > 0/*, "Approval does not allow zero buy amount."*/)

        // Safe to divide now. Make sure fill price does not exceed approval price.
        assert((fill.sellAmount * approval.buyAmount) <= (approval.sellAmount * fill.buyAmount))
    }

    return true
}


function computeBalanceChangePerApproval(approvals, fills) {
    // Find the number of distinct approvals so that we can allocate the 'changes' array.
    var nApprovals = 0
    if (approvals.length <= 1) {
        nApprovals = approvals.length
    } else {
        nApprovals = 1
        for (var i = 1; i < approvals.length; i++) {
            if (approvals[i - 1].approvalId != approvals[i].approvalId) {
                nApprovals += 1
            }
        }
    }

    var changes = []
    for (var i = 0; i < nApprovals; i++) {
       changes.push(0)
    }

    if (fills.length == 0) {
        return changes
    }

    var lastId = approvals[0].approvalId
    var changeIndex = 0

    for (var i = 0; i < fills.length; i++) {
        const approval = approvals[i]

        // Go to the next approval in the changes array.
        if (approval.approvalId != lastId) {
            changeIndex += 1
            lastId = approval.approvalId
        }

        const amount = approval.intent ? fills[i].buyAmount : fills[i].sellAmount
        changes[changeIndex] = changes[changeIndex] + amount
    }

    return changes
}


function checkAllFillsCovered(approvals, changes) {
    if (approvals.length == 0) {
        return false
    }

    var checkId = approvals[0].approvalId
    var changeIndex = 0

    for (var i = 0; i < approvals.length; i++) {
        const approval = approvals[i]

        // Go to the next approval in the changes array.
        if (approval.approvalId != checkId) {
            changeIndex += 1
            checkId = approval.approvalId
        }

        const change = changes[changeIndex]

        if (approval.intent) {
            if (change > approval.buyAmount) {
               throw new Error('Bought more than approved amount.')
            }
        } else {
            if (change > approval.sellAmount) {
               throw new Error('Sold more than approved amount.')
            }
        }
    }

    return true
}


function isProofArrayValid(proofs) {
   assert.equal(proofs.length, tokenList.length)

   for (var i = 0; i < proofs.length; i++) {
       assert.equal(proofs[i].tokenAddress, tokenList[i])
   }

   return true
}


function makeProofs(proofData) {
   const tokens = Object.keys(proofData)

   var proofs = []
   for (var i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      proofs.push({
         tokenAddress : token,
         clientOpeningBalance : proofData[token]
      })
   }

   return proofs
}


function assertAsExpected(action, expected, error) {
   if (expected === (error === null)) {
      if (expected) {
         console.log('OK - Succeeded')
      } else {
         console.log('OK - Failed, as expected.')
      }
   } else {
      if (expected) {
         console.log('ERROR - Expected ' + action + 'Dispute to succeeded but it failed.')
         console.log(error)
      } else {
         console.log('ERROR - Expected ' + action + 'Dispute to fail but it succeeded.')
      }
      process.exit(1)
   }
}


function restoreState(data) {
   dispute                    = null
   totalDisputes              = 0
   disputeFills               = {}
   clientDeposits             = data.deposits
   clientRequestedWithdrawals = data.withdrawals
}



run()


