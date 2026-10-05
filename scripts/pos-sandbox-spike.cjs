#!/usr/bin/env node
// POS sandbox spike — confirms docs/pos-rewards-integration-plan.md §2's facts with real calls.
// Phase 1 deliverable; run before building Phase 2 (Square) / Phase 3 (Clover).
//
// SANDBOX ONLY: the hosts below are hard-coded to Square's and Clover's sandboxes, so a
// production token can't do anything here. Tokens are read from the environment and never
// printed. Every object it creates is labelled "Hightop spike" and (Clover) deleted again.
//
//   npm run pos:spike -- square
//   npm run pos:spike -- clover
//   npm run pos:spike -- clover --order <ORDER_ID>   # an order opened on the sandbox register
//
// Needs (append to .env.local with `>>`, never `>`):
//   SQUARE_SANDBOX_ACCESS_TOKEN   Square Developer Console → your app → Sandbox → Credentials → Sandbox Access token
//   CLOVER_SANDBOX_MERCHANT_ID    Clover sandbox dashboard → the test merchant's ID (13 chars, in the URL)
//   CLOVER_SANDBOX_API_TOKEN      Clover sandbox dashboard → Account & Setup → API Tokens → Create (Orders read+write, Merchant read)

const SQUARE_BASE = "https://connect.squareupsandbox.com";
const CLOVER_BASE = "https://apisandbox.dev.clover.com";

const args = process.argv.slice(2);
const provider = args[0];
const orderFlag = args.indexOf("--order");
const existingOrderId = orderFlag >= 0 ? args[orderFlag + 1] : null;

const ok = (label, detail = "") => console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ""}`);
const fail = (label, detail = "") => console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
const idem = (tag) => `hightop-spike-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const call = async (base, token, method, path, body, extraHeaders = {}) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { status: res.status, json };
};

const errorText = (json) =>
  JSON.stringify(json?.errors ?? json?.message ?? json ?? {}).slice(0, 300);

const square = async () => {
  const token = process.env.SQUARE_SANDBOX_ACCESS_TOKEN;
  if (!token) throw new Error("SQUARE_SANDBOX_ACCESS_TOKEN is not set.");
  // Same pinned version as the app (lib/pos/squareConfig.ts SQUARE_API_VERSION) — keep in step.
  const sq = (method, path, body) => call(SQUARE_BASE, token, method, path, body, { "Square-Version": "2025-01-23" });
  console.log("Square sandbox spike (Square-Version 2025-01-23)");

  const me = await sq("GET", "/v2/merchants/me");
  if (me.status !== 200) return fail("merchant", `${me.status} ${errorText(me.json)}`);
  const merchant = me.json.merchant;
  ok("merchant", `${merchant.business_name} (${merchant.id}), currency ${merchant.currency}`);

  const locs = await sq("GET", "/v2/locations");
  const location = (locs.json?.locations ?? []).find((l) => l.status === "ACTIVE");
  if (!location) return fail("active location", `${locs.status} ${errorText(locs.json)}`);
  ok("location", `${location.name} (${location.id}); capabilities ${JSON.stringify(location.capabilities ?? [])}`);

  // Fact: a DIGITAL card can be created and activated without the Orders API.
  const created = await sq("POST", "/v2/gift-cards", {
    idempotency_key: idem("gc"),
    location_id: location.id,
    gift_card: { type: "DIGITAL" },
  });
  if (created.status !== 200) return fail("CreateGiftCard DIGITAL", `${created.status} ${errorText(created.json)}`);
  const card = created.json.gift_card;
  ok("CreateGiftCard DIGITAL", `id ${card.id}, state ${card.state}, GAN returned: ${Boolean(card.gan)} (not printed)`);

  const activated = await sq("POST", "/v2/gift-cards/activities", {
    idempotency_key: idem("act"),
    gift_card_activity: {
      type: "ACTIVATE",
      location_id: location.id,
      gift_card_id: card.id,
      activate_activity_details: {
        amount_money: { amount: 100, currency: merchant.currency || "USD" },
        buyer_payment_instrument_ids: ["hightop-promo"],
        reference_id: "hightop-spike",
      },
    },
  });
  if (activated.status !== 200) {
    fail("ACTIVATE without Orders API", `${activated.status} ${errorText(activated.json)}`);
  } else {
    ok("ACTIVATE without Orders API", `activity ${activated.json.gift_card_activity?.id}`);
  }

  const reread = await sq("GET", `/v2/gift-cards/${card.id}`);
  ok("RetrieveGiftCard", `state ${reread.json?.gift_card?.state}, balance ${JSON.stringify(reread.json?.gift_card?.balance_money)}`);

  // Fact: idempotency — the same key twice returns the same card, not a second one.
  const key = idem("same");
  const a = await sq("POST", "/v2/gift-cards", { idempotency_key: key, location_id: location.id, gift_card: { type: "DIGITAL" } });
  const b = await sq("POST", "/v2/gift-cards", { idempotency_key: key, location_id: location.id, gift_card: { type: "DIGITAL" } });
  const same = a.json?.gift_card?.id && a.json.gift_card.id === b.json?.gift_card?.id;
  (same ? ok : fail)("idempotency_key replay returns the same card", `${a.json?.gift_card?.id} / ${b.json?.gift_card?.id}`);

  // Fact (docs-only, can't be exercised without the Square POS app): UpdateOrder can't edit
  // POS-app orders. Recorded from developer.squareup.com/docs/orders-api/manage-orders/update-orders.
  console.log("  • UpdateOrder on Square POS orders: not testable from the API; docs say it is refused.");
  console.log("  • REDEEM → webhook gift_card.activity.created: test in Phase 2 by redeeming the card in the sandbox dashboard.");
};

const clover = async () => {
  const token = process.env.CLOVER_SANDBOX_API_TOKEN;
  const mId = process.env.CLOVER_SANDBOX_MERCHANT_ID;
  if (!token || !mId) throw new Error("CLOVER_SANDBOX_API_TOKEN and CLOVER_SANDBOX_MERCHANT_ID must be set.");
  const cl = (method, path, body) => call(CLOVER_BASE, token, method, `/v3/merchants/${encodeURIComponent(mId)}${path}`, body);
  console.log("Clover sandbox spike");

  const merchant = await cl("GET", "");
  if (merchant.status !== 200) return fail("merchant", `${merchant.status} ${errorText(merchant.json)}`);
  ok("merchant", `${merchant.json.name} (${merchant.json.id})`);

  const open = await cl("GET", "/orders?filter=state%3Dopen&orderBy=createdTime%20DESC&limit=5&expand=employee");
  ok("list open orders", `${open.status}; ${(open.json?.elements ?? []).length} returned`);
  for (const o of open.json?.elements ?? []) {
    console.log(`      ${o.id} title=${o.title ?? "-"} total=${o.total ?? 0} employee=${o.employee?.name ?? "-"} created=${new Date(o.createdTime).toISOString()}`);
  }

  let orderId = existingOrderId;
  let createdHere = false;
  if (!orderId) {
    const created = await cl("POST", "/orders", { state: "open", title: "Hightop spike" });
    if (created.status !== 200) return fail("create order", `${created.status} ${errorText(created.json)}`);
    orderId = created.json.id;
    createdHere = true;
    ok("create order (REST)", orderId);
    const li = await cl("POST", `/orders/${orderId}/line_items`, { name: "Hightop spike item", price: 1500 });
    (li.status === 200 ? ok : fail)("add line item $15.00", `${li.status}`);
  } else {
    console.log(`  • using the order you opened on the register: ${orderId}`);
  }

  // Fact: an amount discount is NEGATIVE cents.
  const discount = await cl("POST", `/orders/${orderId}/discounts`, { name: "Hightop Challenge: spike", amount: -500 });
  if (discount.status !== 200) {
    fail("add order-level discount -$5.00", `${discount.status} ${errorText(discount.json)}`);
  } else {
    ok("add order-level discount -$5.00", `discount ${discount.json.id}`);
    const after = await cl("GET", `/orders/${orderId}?expand=discounts,lineItems`);
    ok("order after discount", `total=${after.json?.total} discounts=${JSON.stringify((after.json?.discounts?.elements ?? []).map((d) => d.amount))}`);
    const removed = await cl("DELETE", `/orders/${orderId}/discounts/${discount.json.id}`);
    (removed.status === 200 ? ok : fail)("remove the discount (Phase 3's undo)", `${removed.status}`);
  }

  if (createdHere) {
    const gone = await cl("DELETE", `/orders/${orderId}`);
    (gone.status === 200 ? ok : fail)("delete the spike order", `${gone.status}`);
  }
  if (!existingOrderId) {
    console.log("  • Still to confirm: open an order on the sandbox register (Clover web dashboard → Virtual Terminal / a");
    console.log("    sandbox device), then rerun with --order <id> to prove a DEVICE order is writable while open.");
  }
};

const main = async () => {
  if (provider === "square") return square();
  if (provider === "clover") return clover();
  console.log("Usage: npm run pos:spike -- square | clover [--order <ORDER_ID>]");
  process.exitCode = 1;
};

main().catch((error) => {
  console.error(`Spike failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
