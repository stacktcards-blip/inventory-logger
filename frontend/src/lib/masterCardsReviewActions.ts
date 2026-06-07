export type MasterCardReviewMatchStatus =
  | 'MATCHED_EXISTING'
  | 'NEW_CARD_CANDIDATE'
  | 'SET_MAPPING_NEEDED'
  | 'CARD_NAME_CONFLICT'
  | 'VARIANT_CANDIDATE'
  | 'PARSE_INCOMPLETE'

export type MasterCardReviewAction =
  | 'create_master_card'
  | 'reject_new_card'
  | 'apply_api_name'
  | 'reject_card_name_conflict'
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

  if (matchStatus === 'NEW_CARD_CANDIDATE') return ['create_master_card', 'reject_new_card']
  if (matchStatus === 'CARD_NAME_CONFLICT') return ['apply_api_name', 'reject_card_name_conflict']
  if (matchStatus === 'VARIANT_CANDIDATE') return ['create_variant', 'reject_variant']
  if (matchStatus === 'PARSE_INCOMPLETE') return ['skip_parse_incomplete']

  return []
}

export function isMasterCardReviewActionable(input: MasterCardReviewActionInput): boolean {
  return getMasterCardReviewActions(input).length > 0
}
