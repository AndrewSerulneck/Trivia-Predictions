import { fireEvent, screen } from "@testing-library/react";

// docs/prize-gift-card-redesign-plan.md Phase 4: a list prize's action ("Redeem", "Show gift card")
// sits on the BACK of its card, which is aria-hidden and inert until the card is flipped. These
// helpers flip the list's cards the way a keyboard / screen-reader user does (the hidden "Show
// details" toggle; tests/components.prize-card.test.ts covers the pointer tap), then find the action.

/** Waits for the wallet's cards and turns every one still face-up over. */
export const flipPrizeCards = async (): Promise<void> => {
  for (const toggle of await screen.findAllByRole("button", { name: "Show details" })) fireEvent.click(toggle);
};

/** Flips the list's cards, then the one action called `name` (fails if there is not exactly one). */
export const findPrizeCardAction = async (name: string | RegExp): Promise<HTMLElement> => {
  await flipPrizeCards();
  return screen.getByRole("button", { name });
};

/** Flips the list's cards, then every action called `name`. */
export const findAllPrizeCardActions = async (name: string | RegExp): Promise<HTMLElement[]> => {
  await flipPrizeCards();
  return screen.getAllByRole("button", { name });
};
