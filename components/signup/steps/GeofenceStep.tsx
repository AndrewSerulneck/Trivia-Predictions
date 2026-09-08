"use client";

import { GeofenceEditor } from "@/components/admin/GeofenceEditor";
import { SignupQuestion } from "@/components/signup/SignupQuestion";
import { SignupStaggerItem } from "@/components/signup/SignupStagger";
import type { GeofenceEditorValue, PinSource } from "@/lib/geofenceEditor";
import {
  SIGNUP_RADIUS_MAX,
  SIGNUP_RADIUS_MIN,
  SIGNUP_RADIUS_PRESETS,
  type SignupDraft,
} from "@/lib/selfServeSignup";

// Step 5 of 6 — the geofence.
//
// Reuses the SAME GeofenceEditor the admin venue form uses: map, draggable pin,
// live circle, radius dial (docs/venue-activation-map-radius-plan.md). Phases 1
// and 2 widened it with exactly the three props this call site needs, so nothing
// here is a fork:
//
//   mapsKeyEndpoint  → the public, rate-limited key route. WITHOUT THIS the map
//                      fetches /api/admin/maps-key and 401s for a signed-out
//                      stranger, which is the whole reason Phase 1 added the prop.
//   min / max        → 50–200 m. Imported constants, never `50`/`200` literals:
//                      Phase 8 asserts the bounds live only in lib/selfServeSignup.
//   presets          → signup's four chips instead of admin's 150/300/600.
//
// hideAdvanced hides the lat/long disclosure. A bar owner does not type
// coordinates; a salesperson sometimes does, which is why admin keeps it.
//
// THEMING: GeofenceEditor is a light-surface component (white cards, slate type)
// built for the admin form, and the signup canvas is dark. Rather than re-theme
// it — which would put every admin venue screen at risk for one new caller — it
// is mounted inside a deliberate light panel. The map is a light object anyway,
// so a pale card around it reads as intentional rather than as a theme leak.

type GeofenceStepProps = {
  draft: SignupDraft;
  source: PinSource;
  onChange: (value: GeofenceEditorValue) => void;
};

export function GeofenceStep({ draft, source, onChange }: GeofenceStepProps) {
  return (
    <SignupQuestion
      eyebrow="Your venue"
      title="Set your geofence"
      helper="Players inside this circle can play."
    >
      <SignupStaggerItem>
        <div className="rounded-ht-lg bg-slate-200/90 p-3">
          <GeofenceEditor
            latitude={draft.latitude}
            longitude={draft.longitude}
            radius={draft.radius}
            source={source}
            onChange={onChange}
            hideAdvanced
            mapsKeyEndpoint="/api/signup/maps-key"
            min={SIGNUP_RADIUS_MIN}
            max={SIGNUP_RADIUS_MAX}
            presets={SIGNUP_RADIUS_PRESETS}
          />
        </div>
      </SignupStaggerItem>
    </SignupQuestion>
  );
}
