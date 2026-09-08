const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const log = [];
  page.on("console", (m) => { if (m.type() === "error") log.push("CONSOLE-ERR: " + m.text().slice(0,150)); });
  page.on("response", async (r) => {
    const u = r.url().replace("http://localhost:3000","");
    if (u.startsWith("/api/signup/email-available")||u.startsWith("/api/owner/signup")||u.startsWith("/api/owner/billing")) {
      let b=""; try { b=(await r.text()).slice(0,130); } catch {}
      log.push(`RESP ${r.status()} ${u} :: ${b}`);
    }
  });
  const EMAIL = `probe-${Date.now()}@example.com`;
  await page.addInitScript((email) => {
    window.sessionStorage.setItem("hc_signup_draft", JSON.stringify({
      name:"Probe Tester", email, venueName:"Probe Venue Two", street:"1701 Wynkoop St",
      city:"Denver", state:"CO", zipCode:"80202", placeId:"",
      latitude:47.6062, longitude:-122.3321, radius:100 }));
  }, EMAIL);
  await page.goto("http://localhost:3000/owner/signup", { waitUntil:"networkidle" });
  await page.waitForTimeout(700);
  for (let i=0;i<7;i++){
    if (/Start subscription/.test(await page.content())) break;
    const pw = page.locator('input[type="password"]');
    if (await pw.count()) await pw.first().fill("ProbePassw0rd!");
    await page.locator("button",{hasText:/Next/}).last().click();
    await page.waitForTimeout(900);
  }
  console.log("reached:", (await page.evaluate(()=>document.body.innerText)).split("\n")[0]);
  await page.locator("button",{hasText:/Start subscription/}).last().click();
  await page.waitForTimeout(4000);
  console.log("FINAL URL:", page.url());
  console.log((await page.evaluate(()=>document.body.innerText)).slice(0,260));
  console.log("\n=== LOG ===\n"+log.join("\n"));
  await browser.close();
})();
