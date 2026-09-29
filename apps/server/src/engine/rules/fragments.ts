import type { Draft } from '../draft';
import type { FragmentState } from '../state';

// Gives a fragment straight to the team that needs it, when its holder team is missing
// (GAME_RULES section 4). It then shows on that team's Home as a Found item. Audited.
export function releaseToNeedingTeam(
  d: Draft,
  staffUserId: string,
  fragment: FragmentState,
  reason?: string,
): void {
  d.updateFragment(fragment, { releasedAt: d.now, releasedByStaffId: staffUserId });
  d.audit({
    staffUserId,
    action: 'RELEASE_FRAGMENT',
    teamId: fragment.neededByTeamId,
    before: { released: false },
    after: { released: true, kind: fragment.kind, holderTeamId: fragment.holderTeamId },
    reason,
  });
}
