"use client";

import { useEffect, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { WizardFooter } from "@/components/navigation/WizardFooter";
import { OwnerSheet } from "@/components/owner/sheet/OwnerSheet";
import { FreeQrDownload } from "@/components/owner/store/FreeQrDownload";
import { SlideSteps } from "@/components/owner/sheet/SlideSteps";
import { MerchOrderBar } from "@/components/owner/store/MerchOrderBar";
import { MerchProductCard } from "@/components/owner/store/MerchProductCard";
import { MerchReviewStep } from "@/components/owner/store/MerchReviewStep";
import { MERCH_CATALOG, type MerchProductId } from "@/lib/merchCatalog";
import { buildMerchOrderDraft, cartSummary, type MerchCart, type MerchVenueRef } from "@/lib/merchPricing";
import type { UseOwnerSheetResult } from "@/lib/useOwnerSheet";

// The Join Merch store (docs/join-merch-store-plan.md §3): a WHITE slide-up
// sheet on the Partner Dashboard, opened by the menu's "Order Join Merch" row.
//
// URL-MIRRORED, like Schedule and Rewards: `?sheet=store` is the Shop and
// `?sheet=store&step=review` the Review, so the phone's Back steps Review →
// Shop → closed (lib/ownerSheetParams.ts). Shop is "no step" in the URL.
//
// NO DISCARD PROMPT. The cart is owned by the dashboard page and passed in, so
// closing this sheet never loses anything — there is nothing to discard
// (plan §1 defaults). Don't add a DiscardGuard here.
//
// LOOK-ONLY. Nothing here saves, charges or sends anything: no network request, no API
// route (plan §1 decision 3). A contract test greps components/owner/store/.
// The Review step's final button is disabled and reads "Ordering opens soon";
// a future checkout only has to wire that button to `buildMerchOrderDraft()`.
//
// HOSTED BY THE PAGE, NOT THE VENUE BODY (plan Phase 4.1, F2): the menu row
// always pushes `?sheet=store`, so the sheet must exist while venues load and on
// an account with no venue. Then `venue` is null: the Shop and the free QR card
// still work, but there is no "Ships to", so Review is off (the order bar says
// why) and a `&step=review` URL lands on the Shop.

export type MerchStoreSheetProps = {
  nav: UseOwnerSheetResult;
  /** "Ships to" on Review; the order draft's venue (buildMerchOrderDraft). Null = loading, or no venue. */
  venue: MerchVenueRef | null;
  /** True while the page is still loading the partner's venues (only matters when `venue` is null). */
  venueLoading?: boolean;
  /** THIS venue's cart. Owned by the dashboard page, one per venue (lib/useVenueMerchCart.ts). */
  cart: MerchCart;
  onCartChange: Dispatch<SetStateAction<MerchCart>>;
};

export const MERCH_STORE_STEPS = ["shop", "review"] as const;

export type MerchStoreStep = (typeof MERCH_STORE_STEPS)[number];

/**
 * The step to show for the raw `?step=`. Review needs something to review — a
 * non-empty cart AND a venue to ship it to: a reload or a shared `&step=review`
 * link arrives with an empty cart, and lands on the Shop instead. Anything
 * unknown is the Shop.
 */
export const resolveMerchStoreStep = (rawStep: string | null, canReview: boolean): MerchStoreStep =>
  rawStep === "review" && canReview ? "review" : "shop";

/** Why Review is off even with items in the cart, or undefined when it isn't blocked by the venue. */
export const merchStoreVenueBlock = (venue: MerchVenueRef | null, venueLoading: boolean): string | undefined => {
  if (venue) return undefined;
  return venueLoading ? "Loading your venue…" : "Ordering needs a venue on your account.";
};

/** The `?step=` that belongs in the URL for `step` (the Shop has none). */
export const merchStoreUrlStep = (step: MerchStoreStep): string | null => (step === "shop" ? null : step);

// The final button exists but does nothing until ordering opens (plan §1 decision 3).
const orderingClosed = () => undefined;

export const MerchStoreSheet = ({ nav, venue, venueLoading = false, cart, onCartChange }: MerchStoreSheetProps) => {
  const open = nav.sheet === "store";
  const summary = cartSummary(cart);
  const venueBlock = merchStoreVenueBlock(venue, venueLoading);
  // displayStepFor, not nav.step: a closing sheet keeps its last screen while it slides down.
  const current = resolveMerchStoreStep(nav.displayStepFor("store"), summary.lineCount > 0 && venue !== null);

  // A stale `?step=` (Review after a reload emptied the cart, a hand-typed step, "shop") is
  // corrected. After Shop → Review that pops back to the Shop's own entry rather than
  // rewriting Review's, so one phone Back still closes the store (Phase 4.2, F3).
  const urlStep = nav.step;
  const wantedUrlStep = merchStoreUrlStep(current);
  const correctStep = nav.correctStep;
  useEffect(() => {
    if (open && urlStep !== wantedUrlStep) correctStep(wantedUrlStep);
  }, [open, urlStep, wantedUrlStep, correctStep]);

  const setQuantity = (id: MerchProductId, quantity: number) =>
    onCartChange((prev) => {
      const next: MerchCart = { ...prev };
      if (quantity > 0) next[id] = quantity;
      else delete next[id];
      return next;
    });

  const renderStep = (step: MerchStoreStep): ReactNode =>
    step === "review" && venue ? (
      <MerchReviewStep draft={buildMerchOrderDraft(cart, venue)} venueName={venue.name} />
    ) : (
      <>
        <h3 data-step-heading className="sr-only">
          Products
        </h3>
        <p className="text-sm font-semibold text-slate-600">
          Put a QR code on every table. Guests scan it to join and start playing.
        </p>
        <ul className="divide-y divide-slate-200">
          {MERCH_CATALOG.map((product) => (
            <MerchProductCard
              key={product.id}
              product={product}
              quantity={cart[product.id] ?? 0}
              onQuantityChange={(quantity) => setQuantity(product.id, quantity)}
            />
          ))}
        </ul>
        <FreeQrDownload />
      </>
    );

  const footer =
    current === "review" ? (
      <WizardFooter
        tone="light"
        variant="inline"
        onBack={() => nav.goBack(null)}
        backLabel="Back to store"
        onNext={orderingClosed}
        nextLabel="Ordering opens soon"
        nextDisabled
        nextHideChevron
        hint="Nothing is ordered or charged yet."
      />
    ) : (
      <MerchOrderBar summary={summary} unavailableReason={venueBlock} onReview={() => nav.goToStep("review")} />
    );

  return (
    <OwnerSheet
      open={open}
      onRequestClose={nav.closeSheet}
      tone="light"
      size="tall"
      eyebrow="Hightop Challenge Store"
      title="Order Join Merch"
      footer={footer}
      scrollKey={current}
    >
      <SlideSteps steps={MERCH_STORE_STEPS} current={current} renderStep={renderStep} />
    </OwnerSheet>
  );
};
