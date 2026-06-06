import assert from 'node:assert/strict'
import { test } from 'node:test'

import { getMasterCardReviewActions } from '../src/lib/masterCardsReviewActions'

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
