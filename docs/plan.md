# Folio: Build Plan

Source: [docs/prd.md](prd.md) · Written 17 Nov 2026 · About 48 hours to submission

## Change on 17 Nov: secret keys in Supabase Edge Functions
At your request, all code that uses secret keys runs in **Supabase Edge Functions**, not in Next.js API routes on Vercel. The tasks stay the same, but these parts move:

| Task | Was (Next.js on Vercel) | Now (Supabase Edge Function) |
|---|---|---|
| 4–5 Market data + caching + currency | `lib/market/*`, `app/api/search|quote|history` | `supabase/functions/market/` (search, quote, profile, history, earnings, fx) |
| 12 Performance data | `app/api/performance` | uses the stored history from the `market` function; the maths stays in `lib/performance.ts` (tested with Vitest) |
| 14 News | `app/api/news` | `market` function (news action) |
| 18 AI | `app/api/ai` | `supabase/functions/ai/` |
| 19 Daily job | Vercel cron | `supabase/functions/daily/`, scheduled with pg_cron |
| 20 Email | `lib/email.ts` | inside the `daily` and `notify` functions |
| 21 Push | `lib/push.ts` | `supabase/functions/notify/` |

- **Keys:** Finnhub, OpenRouter, Resend and push keys are pasted into **Supabase → Edge Functions → Secrets**. They are not needed in `.env.local` or Vercel.
- **Login check:** every function checks the user's login token first; anonymous calls are refused.
- **First test (risk):** Yahoo's library must work inside Edge Functions. This is tested before anything else in Task 4. If it fails, the function calls Yahoo's public data directly instead.
- **Extra time:** about 3–4 hours, taken from the buffer.

## Overview
We build Folio in **thin working slices**: each task ends with something you can click and test. The riskiest part (stock data from Finnhub and Yahoo) comes early, so problems show up while there is still time to fix them. We **deploy to Vercel early** (after the core features) and redeploy after every phase, so a working live URL always exists.

Total estimate: **about 32 hours of building**, plus a buffer for testing and sleep. If time runs short, cut in this order: **phone push → email alerts → stock-page news → best/worst day stats**.

## Engineering standards (checked at every checkpoint)
Reusable components (no copy-paste UI), responsive from 375 px to desktop, proper loading/empty/error/saving states, and maintainable, scalable structure (pure tested calculations, one adapter per data source, database-enforced privacy, caching). See PRD 3.13.

## Key decisions
- **Supabase Edge Functions hold every secret key.** The browser and the Next.js site only call our own Edge Functions, never Finnhub, Yahoo, OpenRouter or Resend directly.
- **Supabase row-level security (RLS) on every table.** Private data is readable only by its owner. Public portfolios are exposed only through a database function that returns **% figures**, never dollars or share counts.
- **Holdings are calculated from transactions**, not stored. This keeps them always correct after any edit or delete.
- **One market-data adapter** (`lib/market/`): Finnhub for US stocks, Yahoo for international stocks and all price history, each falling back to the other. Prices are cached for 60 s; history is stored permanently.
- **All number rules live in pure functions** (`lib/portfolio.ts`, `lib/performance.ts`) with unit tests, so they're correct before any screen uses them.
- **Follow alerts are created by a database trigger** when a published user adds a transaction, so they can't be forgotten in the code.
- **One daily Vercel cron job** creates the earnings reminders and sends email/push (the free plan allows one run a day).

## Accounts you'll need (and when)
| When | Account | What I need from you |
|---|---|---|
| Before Task 2 | Supabase | A project's URL + anon key + service-role key (or let me create the project with the connected Supabase tools) |
| Before Task 4 | Finnhub | Paste your key into Supabase → Edge Functions → Secrets |
| Before Task 11 | Vercel | Log in and connect the project (I'll guide you) |
| Before Task 18 | OpenRouter | Paste your key into Supabase Edge Function secrets |
| Before Task 20 | Email | Account + key, pasted into Supabase Edge Function secrets |

Only the public Supabase URL/key and the Supabase secret key go in `folio/.env.local` (never committed). All other secret keys live in Supabase Edge Function secrets.

---

## Task list

### Phase 0: Foundation (about 3.5 h)

**Task 1: Project setup** · S · 45 min
- Install: `@supabase/supabase-js @supabase/ssr recharts yahoo-finance2 zod` + dev `vitest`. Re-run `npm install` to complete the interrupted setup.
- Emerald/white theme colors in Tailwind; `.env.local.example` listing every key; `npm test` script.
- **Accept:** `npm run dev` shows a white page with an emerald "Folio" heading; `npm test` runs.
- **Verify:** `npm run build` and `npm test` both pass.
- **Files:** `package.json`, `app/globals.css`, `vitest.config.ts`, `.env.local.example`, `app/page.tsx`
- **Depends on:** none

**Task 2: Database + security rules** · M · 1.5 h
- `supabase/schema.sql`: tables `profiles`, `transactions`, `cash_entries`, `symbols`, `quote_cache`, `price_history`, `fx_rates`, `follows`, `notifications`, `push_subscriptions`, `ai_messages`; RLS policies on every table; auto-create a profile on sign-up.
- Supabase clients for the browser and the server; middleware that sends logged-out users to `/login`.
- **Accept:** schema applied to Supabase; a table query as user A returns none of user B's rows.
- **Verify:** run the RLS check queries in the Supabase SQL editor (two test users).
- **Files:** `supabase/schema.sql`, `lib/supabase/client.ts`, `lib/supabase/server.ts`, `middleware.ts`
- **Depends on:** 1

**Task 3: Login pages + app shell** · M · 1.5 h
- Sign up (including a starting cash amount + currency), log in, forgot password. Header with logo, bell placeholder and Settings menu (avatar). Emerald top tab bar on desktop, bottom icon bar on phones. Friendly messages file.
- **Accept:** sign up → land on an empty Portfolio tab showing "Your portfolio is a blank ledger…"; tabs switch pages; phone width shows the bottom bar.
- **Verify:** click through in the browser at desktop and 375 px width.
- **Files:** `app/(auth)/login/page.tsx`, `app/(auth)/signup/page.tsx`, `app/(app)/layout.tsx`, `components/AppShell.tsx`, `lib/messages.ts`
- **Depends on:** 2

#### ✅ Checkpoint A
- [ ] Build and tests pass · [ ] sign up / log in / log out works · [ ] two users can't see each other's rows

### Phase 1: Market data, the riskiest part (about 3 h)

**Task 4: Market-data adapter + sectors** · M · 1.5 h
- `lib/market/` with `search`, `quote`, `profile`, `history`, `earnings`: Finnhub first for US stocks, Yahoo for international stocks and history, fallback both ways, friendly errors.
- `lib/sectors.ts` maps Finnhub/Yahoo industry names to the 9 sectors + Other, with unit tests.
- **Accept:** returns correct data for AAPL, LLY, VOD.L (London), 7203.T (Tokyo), 2222.SR (Saudi).
- **Verify:** `npm test` (sector tests) + a quick script calling each function for those 5 tickers.
- **Files:** `lib/market/finnhub.ts`, `lib/market/yahoo.ts`, `lib/market/index.ts`, `lib/sectors.ts`, `lib/__tests__/sectors.test.ts`
- **Depends on:** 1

**Task 5: Data API routes + caching + currency** · M · 1.5 h
- `/api/search`, `/api/quote`, `/api/history`. 60 s quote cache and stored price history in Supabase. `lib/fx.ts` for exchange rates (open.er-api.com, Yahoo as backup), cached daily.
- **Accept:** a second `/api/quote?symbols=AAPL` within 60 s doesn't call Finnhub; history is downloaded only once per ticker; 1 GBP converts to USD correctly.
- **Verify:** call the routes in the browser; check the `quote_cache` and `price_history` rows in Supabase.
- **Files:** `app/api/search/route.ts`, `app/api/quote/route.ts`, `app/api/history/route.ts`, `lib/fx.ts`, `lib/market/cache.ts`
- **Depends on:** 2, 4

#### ✅ Checkpoint B
- [ ] Quotes and history work for the US, London, Tokyo and Saudi test tickers · [ ] fallback works when one source is switched off

### Phase 2: Core portfolio (about 8 h)

**Task 6: Number engine** · S · 1.5 h
- `lib/portfolio.ts`: shares owned, average cost, realized P/L, proceeds, cash from sells/dividends, auto-deposit when a buy exceeds cash, value, % of portfolio, sector sums, stock warnings (10/20%) and sector warnings (25/40%), currency conversion.
- **Accept:** every rule in PRD section 4 has a test, including the worked example (Technology 60 / Financials & Real Estate 20 / Energy 20).
- **Verify:** `npm test`
- **Files:** `lib/portfolio.ts`, `lib/__tests__/portfolio.test.ts`
- **Depends on:** 1

**Task 7: Transaction pop-up** · M · 2 h
- Ticker search box with suggestions → pop-up with Buy/Sell/Dividend, shares, price, date, fees, notes; shows the current price; for a sell, shows proceeds and realized P/L live. Input checks (no future dates, no selling more than owned). Saving stores the transaction and the stock's profile/sector.
- **Accept:** typing "lly" shows Eli Lilly; saving a buy creates a row in Supabase; an invalid input shows a friendly message.
- **Verify:** manual test in the browser + check the row in Supabase.
- **Files:** `components/TickerSearch.tsx`, `components/TransactionModal.tsx`, `app/(app)/actions/transactions.ts`, `lib/validation.ts`
- **Depends on:** 3, 5, 6

**Task 8: Holdings table + summary cards** · M · 2 h
- Portfolio tab: summary cards, holdings table with every PRD 3.4 column, $/% toggle, sortable columns, totals row, warning badges. Stacked cards on phones.
- **Accept:** after buying AAPL and LLY, both rows show the correct values; the % column adds up to 100% (with cash); the toggle switches P/L and day change.
- **Verify:** compare against a hand calculation; check at phone width.
- **Files:** `app/(app)/portfolio/page.tsx`, `components/HoldingsTable.tsx`, `components/SummaryCards.tsx`, `lib/loadPortfolio.ts`
- **Depends on:** 7

**Task 9: Sector table + donut + cash card** · M · 1.5 h
- Sector table with thresholds and warnings, Recharts donut, cash card (add/edit balances in any currency; edits recorded as deposits/withdrawals).
- **Accept:** sector weights add up to 100%; a sector above 40% shows 🔴; editing cash updates the totals.
- **Verify:** manual check with a tech-heavy test portfolio.
- **Files:** `components/SectorTable.tsx`, `components/SectorDonut.tsx`, `components/CashCard.tsx`, `app/(app)/actions/cash.ts`
- **Depends on:** 8

**Task 10: Transactions tab** · S · 1 h
- List of all transactions with filters, edit (reuses the pop-up) and delete with confirmation.
- **Accept:** editing or deleting a transaction updates holdings and cash right away.
- **Verify:** manual test.
- **Files:** `app/(app)/transactions/page.tsx`, `components/TransactionList.tsx`
- **Depends on:** 7

**Task 10b: Precious metals (gold, silver)** · M · 2 h
- Metals as tickers GC=F (gold) and SI=F (silver) in the existing transactions table, quantity in troy ounces; the pop-up gets a Stock / Gold / Silver switch with an oz ⇄ grams toggle (converted on save); market function returns metal prices; Portfolio gets a Precious metals table + asset-mix line; sector table gets a "Precious metals" row (no warning).
- **Accept:** buy 1 oz gold and 100 g silver; values, P/L and weights match a hand calculation; grams convert correctly (100 g = 3.2151 oz); overselling blocked.
- **Files:** `components/TransactionModal.tsx`, `components/MetalsTable.tsx`, `lib/metals.ts` (+ tests), `lib/portfolio.ts`, `supabase/functions/market/*`

**Task 11: First deploy to Vercel** · S · 45 min
- Connect the repo/folder to Vercel, set environment variables, deploy.
- **Accept:** the live URL works for sign-up → add a transaction → see holdings.
- **Verify:** test on the live URL from a phone.
- **Files:** `next.config.ts` (if needed), `vercel.json`
- **Depends on:** 8

#### ✅ Checkpoint C: the core is demo-able
- [ ] Tests and build pass · [ ] full flow works on the live URL · [ ] **Review with you before continuing**

### Phase 3: Performance + stock page (about 5 h)

**Task 12: Performance engine** · M · 2 h
- `lib/performance.ts`: daily portfolio value from transactions × stored closing prices × exchange rates + cash; time-weighted return that ignores deposits/withdrawals; benchmark series (SPY / QQQ / DIA) rebased to the same start; best and worst day.
- **Accept:** tests prove a deposit doesn't count as a gain and that the ranges (1M…All) cut the series correctly.
- **Verify:** `npm test`
- **Files:** `lib/performance.ts`, `lib/__tests__/performance.test.ts`, `app/api/performance/route.ts`
- **Depends on:** 5, 6

**Task 13: Performance tab** · S · 1.5 h
- Line chart, range buttons, $/% toggle, "My portfolio / vs S&P 500 / Nasdaq 100 / Dow" dropdown, summary under the chart.
- **Accept:** every range and toggle works; the benchmark line appears only in "vs" mode.
- **Verify:** manual test with back-dated transactions from about 1 year ago.
- **Files:** `app/(app)/performance/page.tsx`, `components/PerformanceChart.tsx`
- **Depends on:** 12

**Task 14: Stock page** · M · 1.5 h
- `/stock/[ticker]`: header info, price chart with ranges, news, next earnings date, the user's position, "Add transaction" button.
- **Accept:** works for AAPL and VOD.L; missing news or earnings shows a friendly "not available" message.
- **Verify:** manual test.
- **Files:** `app/(app)/stock/[ticker]/page.tsx`, `components/PriceChart.tsx`, `app/api/news/route.ts`
- **Depends on:** 5

#### ✅ Checkpoint D
- [ ] Tests and build pass · [ ] redeploy · [ ] performance numbers sanity-checked against a hand calculation

### Phase 4: Settings + community (about 5 h)

**Task 15: Settings** · M · 1.5 h
- Profile (display name, full name, avatar upload to Supabase Storage, bio), base currency, alert toggles, "Publish my portfolio" checkbox (asks for a bio if empty).
- **Accept:** changing the base currency to EUR converts every total; the avatar shows in the header.
- **Verify:** manual test.
- **Files:** `app/(app)/settings/page.tsx`, `components/SettingsForm.tsx`, `components/AvatarUpload.tsx`, `app/(app)/actions/profile.ts`
- **Depends on:** 8

**Task 16: Public portfolios** · M · 2 h
- Secure database function returning **% only** data for published users. Public tab list + public portfolio page (holdings %, sectors, % performance chart).
- **Accept:** a published portfolio shows no $, share counts or cash anywhere, including in the raw API response; unpublishing hides it straight away.
- **Verify:** two-user test + inspect the network responses in the browser.
- **Files:** `supabase/schema.sql` (function), `app/(app)/public/page.tsx`, `app/(app)/public/[userId]/page.tsx`, `app/api/public/route.ts`
- **Depends on:** 12, 15

**Task 17: Follow + bell alerts** · M · 1.5 h
- Follow/unfollow button; database trigger that creates follower notifications on a new transaction ("TechBull88 bought LLY", with no amounts); bell with unread count and dropdown; mark as read.
- **Accept:** user B follows A; A buys a stock; B's bell shows 1 new alert.
- **Verify:** two-browser test.
- **Files:** `supabase/schema.sql` (trigger), `components/FollowButton.tsx`, `components/NotificationBell.tsx`, `app/api/notifications/route.ts`
- **Depends on:** 16

#### ✅ Checkpoint E
- [ ] Full two-user security test (private data hidden, public shows % only) · [ ] redeploy

### Phase 5: AI, reminders, email, push (about 5.5 h)

**Task 18: AI tab** · M · 1.5 h
- Chat UI with saved history; server route sends the user's holdings (tickers, weights, sectors) + strict rules (stocks/sectors/markets only, no buy/sell, no predictions) to an OpenRouter free model; fallback model; friendly "analyst on a coffee break" message.
- **Accept:** "What's my tech exposure?" uses real holdings; "Should I buy NVDA?" is politely declined; "Write me a poem" is declined.
- **Verify:** manual test with those 3 prompts.
- **Files:** `app/(app)/ai/page.tsx`, `components/ChatBox.tsx`, `app/api/ai/route.ts`, `lib/aiPrompt.ts`
- **Depends on:** 8

**Task 19: Reminders + daily job** · M · 1.5 h
- Reminders tab listing upcoming earnings for held stocks; `/api/cron/daily` (protected by a secret) creates 10-day and 1-day notifications; scheduled in `vercel.json`.
- **Accept:** calling the cron route manually creates the right notifications with no duplicates.
- **Verify:** call the route manually; check the notifications.
- **Files:** `app/(app)/reminders/page.tsx`, `app/api/cron/daily/route.ts`, `vercel.json`
- **Depends on:** 5, 17

**Task 20: Email alerts** · S · 1 h
- Resend integration with a simple emerald email template; sent from the daily job and for follow alerts, if the user has email switched on.
- **Accept:** a test user receives the earnings and follow emails.
- **Verify:** check the inbox (and spam folder).
- **Files:** `lib/email.ts`, `app/api/cron/daily/route.ts`
- **Depends on:** 19

**Task 21: PWA + push (cut first)** · M · 1.5 h
- `manifest.json`, icons, service worker; push subscription saved per device; push sent alongside email.
- **Accept:** Folio installs on Android/desktop Chrome; a test push arrives.
- **Verify:** manual test on a phone.
- **Files:** `public/manifest.json`, `public/sw.js`, `lib/push.ts`, `components/PushToggle.tsx`
- **Depends on:** 19

#### ✅ Checkpoint F
- [ ] All PRD features present · [ ] redeploy

### Phase 6: Polish + submit (about 2.5 h)

**Task 21b: About + Contact pages, footer** · S · 1 h
- Public About page (what Folio is for) and Contact page (Khaled Alzayed + alzayed.k@yahoo.com as a mailto link). Links in the header (desktop next to the bell, phone inside the account menu) and in a footer on every page incl. the landing page. Both open without login.
- **Accept:** links visible on desktop and phone, logged in and out; email link opens the mail app.
- **Files:** `app/about/page.tsx`, `app/contact/page.tsx`, `components/SiteFooter.tsx`, `components/AppShell.tsx`, `middleware.ts`

**Task 22: Friendly states + phone pass** · S · 1.5 h
- Go through every loading, empty, error and "delisted" state; check every tab at 375 px; accessibility basics (labels, contrast, keyboard).
- **Accept:** no raw error text anywhere; nothing overflows on a phone.
- **Files:** `app/not-found.tsx`, `app/error.tsx`, plus small edits across components

**Task 23: Final verification + demo account**
- At the very end, open the finished site in the side browser pane so you can review each page and comment on functionality and design; then apply your feedback. · S · 1 h
- Run the 13 "done" checks in PRD section 9 on the live URL; create a demo account with a realistic portfolio (US + 1–2 international stocks, about 1 year of history) and one published portfolio to follow.
- **Accept:** all 13 checks pass; the demo account is ready for the presentation.

#### ✅ Checkpoint: Done
- [ ] `npm test`, `npm run lint` and `npm run build` pass · [ ] live URL fully tested · [ ] ready to submit

---

## Suggested schedule
| Block | Tasks | Goal |
|---|---|---|
| Today, session 1 | 1–5 | Login + live stock data working |
| Today, session 2 | 6–11 | Core portfolio live on Vercel |
| Tomorrow, session 1 | 12–17 | Performance, stock pages, community |
| Tomorrow, session 2 | 18–21 | AI, reminders, alerts |
| Final hours | 22–23 | Polish, test, demo account, submit |

## Risks and mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| Yahoo (unofficial) slows down or breaks | High | Finnhub fallback for US stocks, stored history, last-price display, demo mostly with US stocks |
| Free API limits during the demo | Medium | 60 s quote cache shared by all users; history stored once |
| Performance math wrong (cash flows, currency) | High | Pure functions with unit tests before any UI |
| Public portfolio leaks $ amounts | High | Only a % database function is exposed; network-response check in Task 16 |
| OpenRouter free model busy or removed | Medium | Configurable model + fallback model + friendly message |
| Running out of time | High | Cut order: push → email → news → best/worst day; deploy after every phase |
| Email lands in spam | Low | Test early; note it in the demo |

## Decisions (from the PRD)
1. A buy larger than available cash: the gap counts as new money deposited. ✅
2. New users enter a starting cash balance and currency at sign-up (Task 3). ✅
3. The app folder is `folio/`. ✅
4. iPhone push only after "Add to Home Screen": waiting for confirmation.

---

## Progress log (updated after every task and checkpoint)

| Task / checkpoint | Status | Tests run and results |
|---|---|---|
| Task 1: Project setup | ✅ Done 17 Nov | `npm run build` passed; `npm test` runs; theme loads |
| Task 2: Database + security | ✅ Done 17 Nov | Schema applied to Supabase. Two-user test: user B saw 0 of A's transactions and 0 cash rows, couldn't edit A's data, and saw only their own profile; duplicate display name got a suffix; starting cash saved (5000 EUR); base currency defaults to USD. Test data rolled back (0 rows left). Supabase security advisor: 0 issues. Build + lint passed. |
| Edge Functions risk test | ✅ Done 17 Nov | Test function deployed to Supabase. Yahoo works there: search ("eli lilly" → LLY), quotes for AAPL, VOD.L (London), 7203.T (Tokyo), 2222.SR (Saudi), 1-month history, sector/industry, earnings date and GBP→USD rate all returned in 100–750 ms. Note: London prices come in pence (GBp), so the adapter must divide by 100. |
| Task 3: Login pages + app shell | ✅ Done 17 Nov | Sign up (with starting cash + currency), log in, log out, forgot/reset password, email-link handler, landing page, header with bell + account menu, 6 emerald tabs, phone bottom bar, "delisted" 404 page, friendly messages. 8 unit tests pass (sign-up checks, safe redirects, friendly error mapping). |
| **Checkpoint A** | ✅ Passed 17 Nov | Build, lint and 8 unit tests pass. Browser: logged-out visitors redirected to login; wrong password shows a friendly message; correct login lands on the requested page; tabs and account menu work; phone layout shows the bottom bar with no sideways scrolling; log out locks private pages again; sign-up input checks show friendly messages. **Bug found and fixed:** a very fast submit before the page loaded could put typed values (including the password) in the URL; buttons now stay disabled until ready and forms use POST. Privacy test through the real API (`npm run privacy`): 12/12 checks passed. |
| Task 4 + 5: Market-data Edge Function + caching + currency | ✅ Done 17 Nov | `market` Edge Function deployed (search, quote, profile/sector, history, earnings, news, exchange rates). Finnhub key read from Supabase secrets (both spellings accepted). 25 unit tests pass (sector mapping, pence→pounds, ticker checks, currency conversion). `npm run market-check`: 25/25 live checks passed: refuses non-logged-in callers and the public anon key; "lly" finds LLY, "aramco" finds 2222.SR; quotes for AAPL, LLY (Finnhub), VOD.L, 7203.T, 2222.SR (Yahoo); London converted to pounds; cached repeat in ~0.5 s; unknown and malformed tickers handled; sectors correct for AAPL, LLY, JPM, XOM, VOD.L, 2222.SR, SPY; ~1 year of history stored and reused; earnings dates, news and exchange rates (incl. SAR, KWD) returned. **Speed fix:** removed an extra login lookup, so cached calls went from 2.8 s to 0.5 s. |
| **Checkpoint B** | ✅ Passed 17 Nov | All quotes/history work for US, London, Tokyo and Saudi tickers. Fallback test: when no provider can answer, the last saved price is returned and marked stale, and other tickers in the same request still work. Build, lint, 25 unit tests, 12/12 privacy checks pass. Supabase security scan: only "leaked password protection" (optional Auth setting) flagged. |
| Task 6: Number engine | ✅ Done 17 Nov | `lib/portfolio.ts`: replays every trade in date order (shares, average cost incl. fees, realized P/L, proceeds, dividends), cash per currency (sells/dividends add cash; buys use same-currency cash, then other currencies converted, then the gap counts as new money; withdrawals tracked), valuation in the base currency (value, % of portfolio incl. cash, day change, unrealized P/L $/%), sector weights + a Cash row so everything sums to 100%, warnings (stock >10% 🟡 >20% 🔴; sector >25% 🟡 >40% 🔴; none for Other/ETFs and Cash), missing-price fallback, "max shares you can sell" check. **22 new tests pass first time** (incl. the PRD worked example: Technology 60 / Financials 20 / Energy 20). Full suite 47/47, lint and build pass. |
| Task 7: Transaction pop-up | ✅ Done 17 Nov | "Add transaction" on Portfolio + Transactions opens a pop-up: type a ticker/company, suggestions after 0.3 s (keyboard or click), then name, exchange, sector, currency and current price fill in automatically; Buy/Sell/Dividend, shares, price ("use current price" shortcut), date, fees, notes; live preview of total cost / proceeds / realized P/L. The server re-checks every input and replays the stock's trades so no sell (or later edit/delete) can exceed shares owned. **Browser tests (test user A):** "lly" → LLY first; buy 10 LLY @ $780 + $4.95 → preview $7,804.95, saved, avg $780.50; selling 15 blocked (preview + server, friendly message); sell 4 @ $900 → proceeds $3,595.05, realized +$473.07, 6 shares left at same avg; dividend $9 saved; Vodafone saved in GBP (£1.05, current £1.166); unknown ticker, empty shares, negative price, future date all show friendly messages; closing saves nothing; phone bottom sheet with no sideways scroll. Database shows exactly the 4 saved trades. 8 new validation tests; full suite 55/55; lint, build, privacy 12/12 pass. Also: build checks now use their own folder so they can't break the dev server. |
| Task 8: Holdings table + summary cards | ✅ Done 17 Nov | Portfolio tab: 5 summary cards (total, cash, today, unrealized, realized + dividends), holdings table with every PRD column (ticker + name, shares, avg price, current, day, total value, % of portfolio, sector, P/L, warning), $/% toggle remembered per viewer, sortable columns, Cash row + Total row (100%), phone cards, loading skeleton, friendly notices for delayed prices or missing exchange rates, error screen with "Try again", auto-refresh every 60 s + manual Refresh. **Bug found and fixed:** starting cash dated at sign-up double-counted older back-dated trades; it's now a balance check-point (2 new tests). **Bug found and fixed:** sorting a second time didn't reverse (headers were rebuilt on each render; now standalone reusable components). **Browser checks vs hand calculation (user A):** total $20,129.08, cash $10,000, LLY $8,590.02 / +$3,907.05 / +83.4% / 42.7% red, VOD £→$ $1,539.06 / +$154.30 / +11.1% / 7.6% OK, weights 100%. User B: €2,500 shown as $2,751.53 with "All cash" state and none of A's data. Phone layout with no sideways scroll. 57/57 tests, lint, build, privacy 12/12 pass. |
| Task 9: Sector table + cash card | ✅ Done 17 Nov | Sector weights table with an emerald bar per sector and thin marks at the 25% / 40% guidelines (chosen over a donut: one hue, readable on phones, no 11-colour legend), tickers per sector, value, warning badge, Cash row, total 100%. Cash card: balances per currency (converted), "Update cash" pop-up (sets the balance as of a date: new "balance" type in the database + engine, 1 new test), cash history with delete; also shown on an empty portfolio. **Browser tests:** user B €2,500 → updated to €3,000 = $3,301.84 on card and total; negative amount → friendly message; deleting the update restores €2,500. **Bug fixed:** the pop-up pre-filled the USD total next to EUR; now pre-fills 3000 EUR. User A sectors: Healthcare 42.7% Very high, Communication 7.6% OK, Cash 49.7%, total 100%, bars match. 58/58 tests, lint, types, build, privacy 12/12. Note: UI tests need the browser pane visible (React's streamed content waits for the screen). |
| Task 10: Transactions tab | ⏳ Next | |
