import { getOwnerRewardDetail } from "@/lib/ownerHistory";
import { withOwnerVenue } from "@/lib/ownerHistoryRoute";

/** GET /api/owner/history/rewards/[rewardId]?venueId=… — one reward's winners, cycle by cycle, at this venue. */
export async function GET(request: Request, { params }: { params: Promise<{ rewardId: string }> }) {
  const { rewardId } = await params;
  return withOwnerVenue(request, async (venueId) => ({
    reward: await getOwnerRewardDetail({ venueId, rewardId }),
  }));
}
