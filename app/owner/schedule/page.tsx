import { redirect } from "next/navigation";

// Scheduling now happens in the dashboard's slide-up sheet
// (docs/partner-dashboard-app-redesign-plan.md §4h). This route stays so old
// links, bookmarks and the rewards wizard's "Schedule Live Trivia" link land on
// the open sheet. A server-component redirect: proxy.ts is untouched.
//
// Not force-dynamic: the layout streams its shell first, so even a dynamic page
// can only redirect via the RSC payload + a meta refresh (HTTP 200), never a 307.
// Browsers follow it on hydration; making it dynamic would only add a function call.
const OwnerSchedulePage = () => redirect("/owner/dashboard?sheet=schedule");

export default OwnerSchedulePage;
