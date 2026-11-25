import type { SplitInvitationDetail } from '@/types/models';

export const MOCK_SPLIT_INVITATIONS: Record<string, SplitInvitationDetail> = {
  inv_pending_01: { inviteId: 'inv_pending_01', splitId: 'demo_split_01', productId: 'prod_mn_01', shareBps: 2500, status: 'PENDING' },
  inv_accepted_02: { inviteId: 'inv_accepted_02', splitId: 'demo_split_02', productId: 'prod_kw_01', shareBps: 1500, status: 'ACCEPTED' },
  inv_rejected_03: { inviteId: 'inv_rejected_03', splitId: 'demo_split_03', productId: 'demo_product_03', shareBps: 1000, status: 'REJECTED' },
};
