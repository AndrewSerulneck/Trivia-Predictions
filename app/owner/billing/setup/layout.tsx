import type { ReactNode } from "react";
import { WebOnlyInApp } from "@/components/native/WebOnlyInApp";

// Web-only inside the native app (docs/native-app-store-plan.md Phase 3,
// lib/nativeLinkOut.ts). The website renders this page unchanged.
export default function OwnerBillingSetupLayout({ children }: { children: ReactNode }) {
  return <WebOnlyInApp path="/owner/billing/setup">{children}</WebOnlyInApp>;
}
