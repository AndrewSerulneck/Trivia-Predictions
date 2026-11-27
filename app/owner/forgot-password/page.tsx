import { OwnerForgotPasswordForm } from "@/app/owner/forgot-password/OwnerForgotPasswordForm";
import { safeOwnerReturnPath } from "@/lib/ownerAuthCodes";

// `?next=` is read on the server so "Back to sign in" returns to the same sign-in page (from a TV's Connect QR:
// the sign-in-only one, docs/fire-tv-app-plan.md Phase AZ1, D40).
const OwnerForgotPasswordPage = async ({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) => {
  const { next } = await searchParams;
  return <OwnerForgotPasswordForm returnPath={safeOwnerReturnPath(next)} />;
};

export default OwnerForgotPasswordPage;
