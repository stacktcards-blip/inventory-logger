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

test('new card candidates can be created or rejected while pending', () => {
  const actions = getMasterCardReviewActions({ matchStatus: 'NEW_CARD_CANDIDATE', reviewStatus: 'pending' })

  assert.deepEqual(actions, ['create_master_card', 'reject_new_card'])
})


test('card name conflicts can be applied or rejected while pending', () => {
  const actions = getMasterCardReviewActions({ matchStatus: 'CARD_NAME_CONFLICT', reviewStatus: 'pending' })

  assert.deepEqual(actions, ['apply_api_name', 'reject_card_name_conflict'])
})

test('rejected card name conflicts stay out of the action queue', () => {
  const actions = getMasterCardReviewActions({
    matchStatus: 'CARD_NAME_CONFLICT',
    reviewStatus: 'rejected_card_name_conflict',
  })

  assert.deepEqual(actions, [])
})

test('already-created variants have no destructive action', () => {
  const actions = getMasterCardReviewActions({ matchStatus: 'VARIANT_CANDIDATE', reviewStatus: 'variant_created' })

  assert.deepEqual(actions, [])
})

test('rejected variants stay out of the action queue', () => {
  const actions = getMasterCardReviewActions({ matchStatus: 'VARIANT_CANDIDATE', reviewStatus: 'rejected_variant' })

  assert.deepEqual(actions, [])
})

test('created or rejected new cards stay out of the action queue', () => {
  assert.deepEqual(getMasterCardReviewActions({ matchStatus: 'MATCHED_EXISTING', reviewStatus: 'created_master_card' }), [])
  assert.deepEqual(getMasterCardReviewActions({ matchStatus: 'NEW_CARD_CANDIDATE', reviewStatus: 'rejected_new_card' }), [])
})

test('actionable queue only includes pending rows with available actions', () => {
  assert.equal(isMasterCardReviewActionable({ matchStatus: 'VARIANT_CANDIDATE', reviewStatus: 'pending' }), true)
  assert.equal(isMasterCardReviewActionable({ matchStatus: 'NEW_CARD_CANDIDATE', reviewStatus: 'pending' }), true)
  assert.equal(isMasterCardReviewActionable({ matchStatus: 'CARD_NAME_CONFLICT', reviewStatus: 'applied_api_name' }), false)
  assert.equal(isMasterCardReviewActionable({ matchStatus: 'CARD_NAME_CONFLICT', reviewStatus: 'rejected_card_name_conflict' }), false)
  assert.equal(isMasterCardReviewActionable({ matchStatus: 'VARIANT_CANDIDATE', reviewStatus: 'variant_created' }), false)
  assert.equal(isMasterCardReviewActionable({ matchStatus: 'VARIANT_CANDIDATE', reviewStatus: 'rejected_variant' }), false)
  assert.equal(isMasterCardReviewActionable({ matchStatus: 'MATCHED_EXISTING', reviewStatus: 'confirmed_existing' }), false)
})
