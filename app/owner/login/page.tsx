import { OwnerLoginForm } from "@/app/owner/login/OwnerLoginForm";
import { safeOwnerReturnPath } from "@/lib/ownerAuthCodes";

// Partner sign-in. `?next=` is read here, on the server, so a phone that scanned a TV's Connect QR never sees the
// normal page's signup link, even for one frame (docs/fire-tv-app-plan.md Phase AZ1, D40).
const OwnerLoginPage = async ({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) => {
  const { next } = await searchParams;
  return <OwnerLoginForm returnPath={safeOwnerReturnPath(next)} />;
};

export default OwnerLoginPage;
