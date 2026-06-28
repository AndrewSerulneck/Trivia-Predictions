import "server-only";

/**
 * SlimCD server-side integration — Secure Sessions & Hosted Payment Pages.
 *
 * Contract verified against "SLIM CD Secure Sessions & Hosted Payment Pages"
 * (v1.0) — the canonical PDF. Important facts that shaped this implementation:
 *
 *  - Session services (CreateSession / CheckSession) take URL-encoded HTTP FORM
 *    name/value pairs and RETURN XML in the standard SLIM CD <reply> envelope.
 *    They are NOT the JSON endpoints. (Doc: "Session Input/Output Format".)
 *      CreateSession: https://stats.slimcd.com/soft/createsession.asp
 *      CheckSession:  https://stats.slimcd.com/soft/checksession.asp
 *      ShowSession:   https://stats.slimcd.com/soft/showsession.asp?sessionid=...
 *
 *  - The PostBack URL and Redirect URL are configured ON THE FORM in the SlimCD
 *    portal (SLIMCD.COM → edit Hosted Payment Page), NOT passed in CreateSession.
 *    The form's Redirect URL must point at /api/owner/billing/return and must be
 *    configured to append the sessionid. See README / setup notes.
 *
 *  - Custom data round-trips via named custom fields. We send var1..var4 in
 *    CreateSession; CheckSession only returns custom fields we re-request BY NAME,
 *    so checkSession() re-sends var1..var4 to get them back. (Doc verbatim example:
 *    var1=test on input → <var1>test</var1> in the CheckSession datablock.)
 *
 *  - approved is Y/N/E/U. Only "Y" is an approval. gateid is the SLIM CD Ticket#
 *    used as the stored-card token for recurring rebills.
 *
 *  - Recurring rebills are a payment transaction, sent to the JSON payment
 *    endpoint with the stored gateid.
 */


const SLIMCD_CREATE_SESSION_URL = "https://stats.slimcd.com/soft/createsession.asp";
const SLIMCD_CHECK_SESSION_URL = "https://stats.slimcd.com/soft/checksession.asp";
const SLIMCD_SHOW_SESSION_BASE = "https://stats.slimcd.com/soft/showsession.asp";
const SLIMCD_JSON_PAYMENT_URL = "https://trans.slimcd.com/soft/json/jsonpayment.asp";

type SlimCDConfig = {
  username: string;
  password: string;
  clientId: string;
  siteId: string;
  priceId: string;
  formName: string;
};

function getConfig(): SlimCDConfig {
  const username = process.env.SLIMCD_PRIVATE_API_KEY?.trim() ?? "";
  const password = process.env.SLIMCD_PASSWORD?.trim() ?? "";
  const clientId = process.env.SLIMCD_CLIENT_ID?.trim() ?? "";
  const siteId = process.env.SLIMCD_SITE_ID?.trim() ?? "";
  const priceId = process.env.SLIMCD_PRICE_ID?.trim() ?? "";
  const formName = process.env.SLIMCD_FORM_NAME?.trim() ?? "";

  if (!clientId || !siteId || !priceId || !formName) {
    throw new Error(
      "SlimCD is not fully configured. Check SLIMCD_CLIENT_ID, SLIMCD_SITE_ID, SLIMCD_PRICE_ID, and SLIMCD_FORM_NAME."
    );
  }
  if (!username && !password) {
    throw new Error(
      "SlimCD authentication is not configured. Set SLIMCD_PRIVATE_API_KEY (API Access Credential) or SLIMCD_PASSWORD."
    );
  }

  return { username, password, clientId, siteId, priceId, formName };
}

function centsToAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

function isDevStub(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.SLIMCD_DEV_STUB === "true";
}

/** Build the auth name/value pairs common to every SlimCD request. */
function authFields(config: SlimCDConfig): Record<string, string> {
  return {
    username: config.username, // API Access Credential (empty password) when used
    password: config.password,
    clientid: config.clientId,
    siteid: config.siteId,
    priceid: config.priceId,
  };
}

// ---------------------------------------------------------------------------
// XML reply parsing (session services return XML, not JSON)
// ---------------------------------------------------------------------------

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Extract the text of an exact top-level tag (won't match <responsecode> for "response"). */
function getTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? decodeXmlEntities(match[1].trim()) : null;
}

type ParsedReply = {
  response: string;
  responsecode: string;
  description: string;
  datablock: Record<string, string>;
};

function parseXmlReply(xml: string): ParsedReply {
  const response = getTag(xml, "response") ?? "";
  const responsecode = getTag(xml, "responsecode") ?? "";
  const description = getTag(xml, "description") ?? "";

  const dbMatch = xml.match(/<datablock(?:\s[^>]*)?>([\s\S]*?)<\/datablock>/i);
  const dbXml = dbMatch ? dbMatch[1] : "";

  const datablock: Record<string, string> = {};
  const leafRe = /<([a-zA-Z0-9_]+)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = leafRe.exec(dbXml)) !== null) {
    datablock[m[1].toLowerCase()] = decodeXmlEntities(m[2].trim());
  }

  return { response, responsecode, description, datablock };
}

async function postForm(url: string, fields: Record<string, string>): Promise<string> {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    body.set(key, value);
  }
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!response.ok) {
    throw new Error(`SlimCD HTTP ${response.status} from ${url}`);
  }
  return response.text();
}

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export type SlimCDSessionResult = {
  ok: boolean;
  sessionId: string | null;
  sessionUrl: string | null;
  error: string | null;
};

export type SlimCDCheckResult = {
  completed: boolean;
  approved: boolean;
  gateid: string | null;
  cardType: string | null;
  last4: string | null;
  approvedAmt: string | null;
  /** Custom metadata round-tripped through var1..var4. */
  variables: { venueId?: string; ownerId?: string; intent?: string; amountCents?: string };
  error: string | null;
};

export type SlimCDResult = {
  approved: boolean;
  gateid: string | null;
  description: string;
};

// ---------------------------------------------------------------------------
// createSession — step 1 of the hosted-page flow
// ---------------------------------------------------------------------------

export async function createSession(params: {
  amountCents: number;
  venueId: string;
  ownerId: string;
  intent: "subscribe" | "update_card";
}): Promise<SlimCDSessionResult> {
  if (isDevStub()) {
    const fakeId = `STUBSESS${Date.now().toString(16).toUpperCase()}`.padEnd(40, "0").slice(0, 40);
    // Encode metadata as URL params on the return handler URL. This survives across
    // the two separate HTTP requests (session creation → return redirect) without
    // relying on module-level state that Next.js dev mode can clear between requests.
    const meta = new URLSearchParams({
      venueId: params.venueId,
      ownerId: params.ownerId,
      intent: params.intent,
      amountCents: String(params.amountCents),
    });
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
    return {
      ok: true,
      sessionId: fakeId,
      sessionUrl: `${base}/api/owner/billing/return?sessionid=${fakeId}&${meta.toString()}`,
      error: null,
    };
  }

  const config = getConfig();

  // update_card stores a card without charging. AUTH $0.00 validates the card and
  // returns a gateid token. (LOAD is the documented store-only alternative; if a
  // processor rejects $0 auths, switch this to a $1.00 AUTH that is later VOIDed,
  // or to transtype=LOAD — confirm the right path with SlimCD for the account.)
  const transtype = params.intent === "update_card" ? "AUTH" : "SALE";
  const amount = params.intent === "update_card" ? "0.00" : centsToAmount(params.amountCents);

  const fields: Record<string, string> = {
    ...authFields(config),
    formname: config.formName,
    transtype,
    amount,
    // Custom metadata, returned later by CheckSession when re-requested by name.
    var1: params.venueId,
    var2: params.ownerId,
    var3: params.intent,
    var4: String(params.amountCents),
  };

  let xml: string;
  try {
    xml = await postForm(SLIMCD_CREATE_SESSION_URL, fields);
  } catch (err) {
    return { ok: false, sessionId: null, sessionUrl: null, error: (err as Error).message };
  }

  const reply = parseXmlReply(xml);
  const sessionId = reply.datablock.sessionid ?? null;

  if (reply.response !== "Success" || !sessionId) {
    return {
      ok: false,
      sessionId: null,
      sessionUrl: null,
      error: reply.description || reply.response || "Session creation failed.",
    };
  }

  return {
    ok: true,
    sessionId,
    sessionUrl: `${SLIMCD_SHOW_SESSION_BASE}?sessionid=${sessionId}`,
    error: null,
  };
}

// ---------------------------------------------------------------------------
// checkSession — step 4 of the hosted-page flow (called on return)
// ---------------------------------------------------------------------------

export async function checkSession(sessionId: string): Promise<SlimCDCheckResult> {
  if (isDevStub()) {
    return {
      completed: true,
      approved: true,
      gateid: `STUBGATE-${Date.now().toString(36)}`,
      cardType: "V",
      last4: "1111",
      approvedAmt: null,
      variables: {}, // stub metadata travels via URL params, not here — see return/route.ts
      error: null,
    };
  }

  const config = getConfig();

  // wait=0 + waitforcompleted=no: this is a post-redirect status read, not a poll.
  // var1..var4 are re-supplied (empty) so SlimCD returns our stored custom values.
  const fields: Record<string, string> = {
    ...authFields(config),
    sessionid: sessionId,
    wait: "0",
    waitforcompleted: "no",
    var1: "",
    var2: "",
    var3: "",
    var4: "",
  };

  let xml: string;
  try {
    xml = await postForm(SLIMCD_CHECK_SESSION_URL, fields);
  } catch (err) {
    return emptyCheck((err as Error).message);
  }

  const reply = parseXmlReply(xml);
  const db = reply.datablock;

  // response: Success | FAIL | TIMEOUT | Cancel | Error. TIMEOUT means not done yet.
  const completedTag = (db.completed ?? "").toLowerCase();
  const completed = completedTag === "yes" || ["success", "fail", "cancel", "error"].includes(reply.response.toLowerCase());

  const approvedTag = (db.approved ?? "").toUpperCase();
  const approved = approvedTag === "Y" && reply.response === "Success";

  return {
    completed,
    approved,
    gateid: db.gateid ?? null,
    cardType: db.cardtype ?? null,
    last4: db.last4 ?? null,
    approvedAmt: db.approvedamt ?? null,
    variables: {
      venueId: db.var1 || undefined,
      ownerId: db.var2 || undefined,
      intent: db.var3 || undefined,
      amountCents: db.var4 || undefined,
    },
    error: reply.response === "Error" ? reply.description || "Session error." : null,
  };
}

function emptyCheck(error: string): SlimCDCheckResult {
  return {
    completed: false,
    approved: false,
    gateid: null,
    cardType: null,
    last4: null,
    approvedAmt: null,
    variables: {},
    error,
  };
}

// ---------------------------------------------------------------------------
// chargeRecurring — daily billing cron, charges a stored gateid token
// ---------------------------------------------------------------------------

export async function chargeRecurring(
  gateid: string,
  amountCents: number,
  clientRef: string
): Promise<SlimCDResult> {
  if (isDevStub()) {
    const declineFor = amountCents === 666;
    return {
      approved: !declineFor,
      gateid: declineFor ? null : `STUBGATE-${Date.now().toString(36)}`,
      description: declineFor ? "Declined (stub)" : "Approved (stub)",
    };
  }

  const config = getConfig();

  const fields: Record<string, string> = {
    ...authFields(config),
    transtype: "SALE",
    amount: centsToAmount(amountCents),
    gateid,
    recurring: "yes",
    client_transref: clientRef,
  };

  // jsonpayment.asp returns JSON. Tolerate both the {reply:{...}} envelope and a
  // flat {response,responsecode,datablock} shape.
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);

  const response = await fetch(SLIMCD_JSON_PAYMENT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!response.ok) {
    throw new Error(`SlimCD HTTP ${response.status} from ${SLIMCD_JSON_PAYMENT_URL}`);
  }

  const json = (await response.json()) as {
    reply?: { response?: string; description?: string; datablock?: Record<string, string> };
    response?: string;
    description?: string;
    datablock?: Record<string, string>;
  };
  const envelope = json.reply ?? json;
  const datablock = envelope.datablock ?? {};
  const approved = (envelope.response === "Success") && (datablock.approved ?? "").toUpperCase() === "Y";

  return {
    approved,
    gateid: datablock.gateid ?? null,
    description: datablock.declinestr || envelope.description || (approved ? "Approved" : "Declined"),
  };
}

export { SLIMCD_SHOW_SESSION_BASE };
