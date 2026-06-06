export type MasterCardReviewMatchStatus =
  | 'MATCHED_EXISTING'
  | 'NEW_CARD_CANDIDATE'
  | 'SET_MAPPING_NEEDED'
  | 'CARD_NAME_CONFLICT'
  | 'VARIANT_CANDIDATE'
  | 'PARSE_INCOMPLETE'

export type MasterCardReviewAction =
  | 'apply_api_name'
  | 'create_variant'
  | 'reject_variant'
  | 'skip_parse_incomplete'

type MasterCardReviewActionInput = {
  matchStatus: MasterCardReviewMatchStatus
  reviewStatus?: string | null
}

export function getMasterCardReviewActions({
  matchStatus,
  reviewStatus,
}: MasterCardReviewActionInput): MasterCardReviewAction[] {
  const status = reviewStatus ?? 'pending'
  if (status !== 'pending') return []

  if (matchStatus === 'CARD_NAME_CONFLICT') return ['apply_api_name']
  if (matchStatus === 'VARIANT_CANDIDATE') return ['create_variant', 'reject_variant']
  if (matchStatus === 'PARSE_INCOMPLETE') return ['skip_parse_incomplete']

  return []
}
