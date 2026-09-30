import { redirect } from "next/navigation";

// The Rewards page became a sheet on the dashboard
// (docs/partner-dashboard-app-redesign-plan.md §4h). A server-component redirect so
// old bookmarks land on the open sheet; proxy.ts is deliberately not involved.
const OwnerCompetitionsPage = () => redirect("/owner/dashboard?sheet=rewards");

export default OwnerCompetitionsPage;
