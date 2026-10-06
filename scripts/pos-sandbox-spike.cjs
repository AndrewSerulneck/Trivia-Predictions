#!/usr/bin/env node
// POS sandbox spike — confirms docs/pos-rewards-integration-plan.md §2's facts with real calls.
// Phase 1 deliverable; run before building Phase 2 (Square) / Phase 3 (Clover).
//
// SANDBOX ONLY: the hosts below are hard-coded to Square's and Clover's sandboxes, so a
// production token can't do anything here. Tokens are read from the environment and never
// printed. Every object it creates is labelled "Hightop spike" and (Clover) deleted again.
//
//   npm run pos:spike -- square
//   npm run pos:spike -- square-discount                   # Phase 2d: catalog discounts (created, then deleted)
//   npm run pos:spike -- clover
//   npm run pos:spike -- clover --order <ORDER_ID>   # an order opened on the sandbox register
//   npm run pos:spike -- clover-token                # Phase 3a: token-proof negative controls
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

  // No expand=employee: that needs Employees-read and 403s the whole call (Phase 3 handoff §5).
  const open = await cl("GET", "/orders?filter=state%3Dopen&orderBy=createdTime%20DESC&limit=5");
  (open.status === 200 ? ok : fail)("list open orders", `${open.status}; ${(open.json?.elements ?? []).length} returned`);
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
    // expand=discounts,lineItems 403s with a merchant test token; read the two separately.
    const after = await cl("GET", `/orders/${orderId}`);
    const discounts = await cl("GET", `/orders/${orderId}/discounts`);
    (after.status === 200 && discounts.status === 200 ? ok : fail)(
      "order after discount",
      `${after.status}/${discounts.status} state=${after.json?.state} total=${after.json?.total} discounts=${JSON.stringify((discounts.json?.elements ?? []).map((d) => d.amount))}`,
    );
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

// Phase 3a fact 1, server half: which REST call proves a token is OUR app's for THIS merchant?
// Candidate: GET /v3/apps/{appId}/merchants/{mId}/billing_info (app-scoped). This runs the negative
// controls with the merchant test API token, which belongs to no app; the device spike app
// (clover-spike/) runs the positive case with a real CloverAuth token. Prints statuses only.
const cloverToken = async () => {
  const token = process.env.CLOVER_SANDBOX_API_TOKEN;
  const mId = process.env.CLOVER_SANDBOX_MERCHANT_ID;
  const appId = process.env.CLOVER_SANDBOX_APP_ID;
  if (!token || !mId || !appId) {
    throw new Error("CLOVER_SANDBOX_API_TOKEN, CLOVER_SANDBOX_MERCHANT_ID and CLOVER_SANDBOX_APP_ID must be set.");
  }
  const get = (path, tok = token) => call(CLOVER_BASE, tok, "GET", path);
  console.log("Clover token-proof spike (negative controls; expect the marked statuses)");
  const cases = [
    ["merchant read, merchant API token (expect 200)", `/v3/merchants/${mId}`, token, 200],
    ["billing_info, our app, merchant API token (expect 401: token is not our app's)", `/v3/apps/${appId}/merchants/${mId}/billing_info`, token, 401],
    ["billing_info, unknown app (expect 404)", `/v3/apps/AAAAAAAAAAAAA/merchants/${mId}/billing_info`, token, 404],
    ["billing_info, garbage token (expect 401)", `/v3/apps/${appId}/merchants/${mId}/billing_info`, "not-a-real-token", 401],
  ];
  for (const [label, path, tok, expected] of cases) {
    const res = await get(path, tok);
    (res.status === expected ? ok : fail)(label, `${res.status}`);
  }
  const apps = await get(`/v3/merchants/${mId}/apps?limit=500`);
  const ours = (apps.json?.elements ?? []).find((a) => a.id === appId);
  (ours ? ok : fail)("our app is installed on the test merchant", ours ? `${ours.name} package=${ours.packageName ?? "(no APK uploaded yet)"}` : `${apps.status}`);
};

// Phase 2d: menu-item prizes become a ready-made Square catalog discount per prize. Confirms that
// a FIXED_PERCENTAGE discount takes a `maximum_amount_money` cap, that an exact name search
// finds it (case-insensitively), and that a deleted one is no longer found. Everything it
// creates is deleted again.
const squareDiscount = async () => {
  const token = process.env.SQUARE_SANDBOX_ACCESS_TOKEN;
  if (!token) throw new Error("SQUARE_SANDBOX_ACCESS_TOKEN is not set.");
  const sq = (method, path, body) => call(SQUARE_BASE, token, method, path, body, { "Square-Version": "2025-01-23" });
  console.log("Square sandbox discount spike (Square-Version 2025-01-23)");
  const stamp = Date.now().toString(36);
  const name = `Hightop spike: 50% off Appetizer (max $12) ${stamp}`;
  const search = (value) =>
    sq("POST", "/v2/catalog/search", {
      object_types: ["DISCOUNT"],
      query: { exact_query: { attribute_name: "name", attribute_value: value } },
    });

  const created = await sq("POST", "/v2/catalog/object", {
    idempotency_key: idem("disc"),
    object: {
      type: "DISCOUNT",
      id: "#hightop-spike-discount",
      present_at_all_locations: true,
      discount_data: {
        name,
        discount_type: "FIXED_PERCENTAGE",
        percentage: "50",
        maximum_amount_money: { amount: 1200, currency: "USD" },
        pin_required: false,
      },
    },
  });
  if (created.status !== 200) return fail("UpsertCatalogObject FIXED_PERCENTAGE + max", `${created.status} ${errorText(created.json)}`);
  const object = created.json.catalog_object;
  ok(
    "UpsertCatalogObject FIXED_PERCENTAGE + max",
    `id ${object.id}, data ${JSON.stringify(object.discount_data)}, all locations ${object.present_at_all_locations}`,
  );

  const found = await search(name);
  const foundIds = (found.json?.objects ?? []).map((o) => o.id);
  (foundIds.includes(object.id) ? ok : fail)("SearchCatalogObjects exact name", `${found.status} ${JSON.stringify(foundIds)}`);
  const lower = await search(name.toLowerCase());
  const lowerIds = (lower.json?.objects ?? []).map((o) => o.id);
  console.log(`  • exact name search, lower-cased: ${lower.status} ${JSON.stringify(lowerIds)} (case-insensitive: ${lowerIds.includes(object.id)})`);
  const prefix = await search(name.slice(0, -3));
  console.log(`  • exact name search, truncated name: ${JSON.stringify((prefix.json?.objects ?? []).map((o) => o.id))} (expect none)`);

  const del = await sq("DELETE", `/v2/catalog/object/${object.id}`);
  (del.status === 200 ? ok : fail)("DeleteCatalogObject", `${del.status}`);
  const afterDelete = await search(name);
  const afterIds = (afterDelete.json?.objects ?? []).map((o) => o.id);
  (afterIds.length === 0 ? ok : fail)("deleted discount is not found by search", `${afterDelete.status} ${JSON.stringify(afterIds)}`);

  const amount = await sq("POST", "/v2/catalog/object", {
    idempotency_key: idem("disc-amt"),
    object: {
      type: "DISCOUNT",
      id: "#hightop-spike-discount-amount",
      present_at_all_locations: true,
      discount_data: {
        name: `Hightop spike: $5 off Entrée ${stamp}`,
        discount_type: "FIXED_AMOUNT",
        amount_money: { amount: 500, currency: "USD" },
        pin_required: false,
      },
    },
  });
  if (amount.status !== 200) return fail("UpsertCatalogObject FIXED_AMOUNT", `${amount.status} ${errorText(amount.json)}`);
  ok("UpsertCatalogObject FIXED_AMOUNT", `data ${JSON.stringify(amount.json.catalog_object.discount_data)}`);
  const delAmount = await sq("DELETE", `/v2/catalog/object/${amount.json.catalog_object.id}`);
  (delAmount.status === 200 ? ok : fail)("cleanup", `${delAmount.status}`);
};

const main = async () => {
  if (provider === "square") return square();
  if (provider === "square-discount") return squareDiscount();
  if (provider === "clover") return clover();
  if (provider === "clover-token") return cloverToken();
  console.log("Usage: npm run pos:spike -- square | square-discount | clover [--order <ORDER_ID>] | clover-token");
  process.exitCode = 1;
};

main().catch((error) => {
  console.error(`Spike failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
