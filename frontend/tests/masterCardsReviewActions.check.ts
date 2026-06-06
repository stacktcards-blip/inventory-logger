import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  getMasterCardReviewActions,
  isMasterCardReviewActionable,
} from '../src/lib/masterCardsReviewActions'

test('variant candidates can be created or rejected while pending', () => {
  const actions = getMasterCardReviewActions({ matchStatus: 'VARIANT_CANDIDATE', reviewStatus: 'pending' })

  assert.deepEqual(actions, ['create_variant', 'reject_variant'])
})

test('already-created variants have no destructive action', () => {
  const actions = getMasterCardReviewActions({ matchStatus: 'VARIANT_CANDIDATE', reviewStatus: 'variant_created' })

  assert.deepEqual(actions, [])
})

test('rejected variants stay out of the action queue', () => {
  const actions = getMasterCardReviewActions({ matchStatus: 'VARIANT_CANDIDATE', reviewStatus: 'rejected_variant' })

  assert.deepEqual(actions, [])
})

test('actionable queue only includes pending rows with available actions', () => {
  assert.equal(isMasterCardReviewActionable({ matchStatus: 'VARIANT_CANDIDATE', reviewStatus: 'pending' }), true)
  assert.equal(isMasterCardReviewActionable({ matchStatus: 'CARD_NAME_CONFLICT', reviewStatus: 'applied_api_name' }), false)
  assert.equal(isMasterCardReviewActionable({ matchStatus: 'VARIANT_CANDIDATE', reviewStatus: 'variant_created' }), false)
  assert.equal(isMasterCardReviewActionable({ matchStatus: 'VARIANT_CANDIDATE', reviewStatus: 'rejected_variant' }), false)
  assert.equal(isMasterCardReviewActionable({ matchStatus: 'MATCHED_EXISTING', reviewStatus: 'confirmed_existing' }), false)
})
