import { CategoryBlitzPlayShell } from "@/components/category-blitz/CategoryBlitzPlayShell";

// Category Blitz intentionally uses its own minimal play shell instead of the shared
// venue game landing/page shell — see components/category-blitz/CategoryBlitzPlayShell.tsx
// for why (docs/category-blitz-app-feel-plan.md, Phase 3).
export default function CategoryBlitzPlayPage() {
  return <CategoryBlitzPlayShell />;
}
