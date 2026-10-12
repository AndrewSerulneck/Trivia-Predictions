import { describe, expect, it } from "vitest";
import { isMissingFunction } from "@/lib/supabaseRpcErrors";

// Multi-venue billing Phase 6.8 (review 6.5 #5): the one "the RPC isn't deployed yet" test.
describe("isMissingFunction", () => {
  it("PostgREST's PGRST202 and Postgres's 42883 are missing, whatever the message", () => {
    expect(isMissingFunction({ code: "PGRST202", message: "Could not find the function public.x" })).toBe(true);
    expect(isMissingFunction({ code: "42883", message: "function x() does not exist" }, "claim_venue_addition")).toBe(true);
  });

  it("with a name, a code-less error naming the function counts; without one it does not", () => {
    expect(isMissingFunction({ message: "function claim_venue_addition not found" }, "claim_venue_addition")).toBe(true);
    expect(isMissingFunction({ message: "function claim_venue_addition not found" })).toBe(false);
    expect(isMissingFunction({ message: "function finish_venue_bill_change not found" }, "claim_venue_addition")).toBe(false);
  });

  it("other errors and no error are not missing", () => {
    expect(isMissingFunction({ code: "23505", message: "duplicate key" }, "claim_venue_addition")).toBe(false);
    expect(isMissingFunction(null, "x")).toBe(false);
    expect(isMissingFunction(undefined)).toBe(false);
  });
});
