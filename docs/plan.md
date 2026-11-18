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
- Reminders tab listing upcoming earnings for held stocks; `/api/cron/daily` (protected by a secret) creates earnings notifications (7 days and 1 day before by default, customizable per user); scheduled in `vercel.json`.
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

### Phase 7: Shariah screening (about 4.5 h, built 17 Nov)
Decisions: shown on stock pages and in the holdings table; on by default with a switch to hide it; AAOIFI rules; no purification amounts yet.

- **Task 24: Shariah data and storage (about 1.5 h).**
  - New table `shariah_cache`: ticker, industry, total debt, cash plus short-term investments, market value, data date, result, reasons, and when it was updated. Every signed-in user can read it; only Edge Functions can write it.
  - New column `profiles.show_shariah` (true by default).
  - New `shariah` action in the `market` Edge Function: it gets the industry and balance sheet from Yahoo (assetProfile, fundamentalsTimeSeries balance sheet, price/market value), saves the result and reuses it for 7 days. It answers several tickers in one call.
  - **Tests:** `market-check` gets new checks (AAPL and MSFT return figures, JPM is a bank, a second call is served from the cache, an unknown ticker returns a friendly "Not Screened"), plus an RLS check that users can't write to the table.
- **Task 25: The rules, as pure tested code (about 1 h).**
  - `lib/shariah.ts`: `screen(input)` returns { status, rules: [{ name, value, limit, pass }], note }. It holds the business lists (not allowed, mixed income), the 30% and 30% ratios, missing-data handling, the ETF and metals handling, and the Shariah ETF list.
  - **Tests:** a bank → Not Compliant; a brewer → Not Compliant; a hotel → Doubtful; debt 35% → Not Compliant; debt 29.9% and cash 10% with an allowed business → Compliant; missing debt → Doubtful; SPY → Not Screened; SPUS → Compliant (Shariah ETF); GC=F → Not Screened.
- **Task 26: Show it (about 1.5 h).**
  - A reusable `ShariahBadge` component (emerald, amber, red or grey dot plus words, never colour alone) with an ⓘ details pop-over listing each rule as value vs limit and pass or fail, the data date and the scholar note.
  - Stock page: the badge next to the name. Holdings table: a **Shariah** column, loaded with the valuation and streamed so it never slows the table.
  - Settings: a **Show Shariah Screening** switch saved to `show_shariah`. When it's off, the badge and column are hidden.
  - Friendly message if the data is slow: "Shariah data is still on its way from the exchange."
- **Task 27: Test, deploy, check live, log (about 0.5 h).**
  - Unit tests, type check, lint, build, `privacy-check` and `market-check`.
  - On the live site: the badges on AAPL, JPM and a hotel stock; the holdings column on the demo account; switching it off and on in Settings; phone width.

#### ✅ Checkpoint G
Stock pages and the holdings table show correct badges for a mix of allowed, not-allowed, mixed and ETF tickers. The details box shows each rule with numbers and the note. The Settings switch hides and shows it. All tests pass on the live site.

### Phase 8: Multiple portfolios, Real and Paper (about 7 h, built 17 Nov)
Decisions: the button sits next to the portfolio switcher under the tab bar; the two types are called Real and Paper; any number of either, up to 10 in total, named freely; Paper portfolios have their own pretend cash and accept any date and price; comparing is a % chart overlay on Performance; each portfolio is published separately and followed separately; earnings reminders and the AI cover Paper too; delete needs the name typed to confirm.

- **Task 28: Database (about 1.5 h).**
  - New `portfolios` table: id, user_id, name (1–40 characters, unique per user), kind ('real' or 'paper'), is_public, position, created_at. RLS: the owner can do everything; others can read it only when it's published. A trigger caps it at 10 per user.
  - Add `portfolio_id` (not null, deleted along with its portfolio) to `transactions` and `cash_entries`. RLS insert and update checks confirm the portfolio belongs to the user.
  - Moving existing data: create "My Portfolio" (real) for every user, carry over `profiles.is_public`, fill in `portfolio_id` on all trades and cash, then make it required.
  - `handle_new_user` creates "My Portfolio" and puts the sign-up starting cash into it.
  - **Tests:** `privacy-check` gets new checks: user B can't read A's portfolios or add trades to them, an 11th portfolio is refused, a published portfolio is readable and an unpublished one isn't, and deleting a portfolio removes its trades.
- **Task 29: Current portfolio everywhere (about 1.5 h).**
  - `lib/currentPortfolio.ts` reads the chosen portfolio from a cookie (`folio.portfolio`), checks it belongs to the user, and falls back to the first one.
  - `loadLedgerData`, valuation, performance, transactions and the stock page "Your Position" filter by it. Server actions (transactions, cash) write to the current portfolio and re-check ownership.
  - **Tests:** unit tests for the fallback logic; two portfolios with different trades show different totals.
- **Task 30: Switcher, New Portfolio and Manage (about 1.5 h).**
  - A `PortfolioSwitcher` bar under the tab bar: the current name plus a Paper label, a dropdown of all portfolios, a **+ New Portfolio** button and **Manage**. It works on phones too.
  - `NewPortfolioModal`: Name, a Real or Paper choice with one-line explanations, Starting Cash and Currency (required for Paper).
  - `ManagePortfolioModal`: rename, a Publish switch (asks for a bio if missing), and Delete with the name typed to confirm.
  - Friendly messages: "You've reached 10 portfolios, the desk is full.", "You already have a portfolio with that name."
- **Task 31: Public and follow per portfolio (about 1 h).**
  - `public_snapshots` keyed by portfolio, with its name and type. `follows` gets `portfolio_id`. `notify_followers` alerts only that portfolio's followers ("TechBull88 · Paper: Growth Lab bought NVDA").
  - The Public tab shows one card per published portfolio with the Paper label. Pages move to `/public/p/[portfolioId]`, and old `/public/[userId]` links redirect.
  - Settings: the Public Portfolio section becomes a note pointing to Manage; the bio stays.
- **Task 32: Compare on Performance (about 1 h).**
  - A **Compare With** multi-select of the user's other portfolios. Each one is drawn as a % line using the existing time-weighted return code; choosing any portfolio switches the chart to %. Colours stay consistent, and each line is labelled in the legend.
  - **Tests:** a unit test that two portfolios' series line up by date.
- **Task 33: AI, reminders, Paper labels, and checks (about 0.5 h).**
  - The AI context uses the current portfolio and mentions "Paper" when it is one. The daily job already groups by user and ticker (so there are no duplicate alerts); confirm it.
  - Paper labels on the switcher, the Public cards and page titles.
- **Task 34: Test, deploy, check live, log (about 0.5 h).**
  - Unit tests, privacy check, market check and build.
  - On the live site: create a Paper portfolio with $10,000, add a backdated buy, switch back and forth, compare on Performance, publish it and follow it from user B, rename it, delete it, try an 11th portfolio, and check phone width.

#### ✅ Checkpoint H
A user can keep several Real and Paper portfolios with fully separate trades and cash, switch between them, compare them in %, publish and follow them one by one, and delete them safely. Nobody can see or change another user's unpublished portfolios. Everything passes on the live site.

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
| Task 10: Transactions tab | ✅ Done 17 Nov | List of all trades (newest first): stock, date, type badge, shares, price per share, fees, total (cost / proceeds / cash added), realized P/L for sells, notes; filters by stock and type with a live count; edit (reuses the pop-up, pre-filled) and delete with confirmation. **Browser tests (user A):** 4 trades listed with correct totals; "Sells" filter → 1 of 4; deleting the original LLY buy blocked ("would leave a later sell without enough shares"); edit pre-filled (4, $900, $4.95) and showed 10 shares owned; editing to 12 shares blocked; editing to 5 saved with realized P/L +$592.57 (hand calc ✓), then reverted to 4; deleting the dividend worked (3 of 3). **Your feedback applied:** holdings and transactions now use a real table with clear column headings at every screen size (Stock · Shares owned · Avg. buy price · Current price · Day change · Total value · % of portfolio · Sector · Profit / Loss · Warning); on small screens the table scrolls sideways inside its box with the Stock column pinned, page never scrolls sideways. 58/58 tests, lint, types, build, privacy 12/12. |
| Design feedback (17 Nov) | ✅ Done | Title Case on every heading, label, column and button across all pages (incl. small words: "% Of Portfolio", "Price Per Share", "Very High"). Holdings column renamed "Shares" and "Buy Price" with a reusable ⓘ info tip ("Average price you paid per share, including fees.") that opens on hover, keyboard focus or tap and stays inside the window. Checked in the browser; 58/58 tests and build pass. |
| Task 10b: Precious metals | ✅ Done 17 Nov | Gold and silver as a third asset type: pop-up asset choice Stock / Gold / Silver, Troy oz ⇄ Grams switch that converts typed values, metals stored in troy ounces at price per ounce (USD, COMEX via Yahoo), Buy/Sell only, overselling blocked with a metal-specific message. Portfolio: Asset Mix bar (Stocks / Precious Metals / Cash with labels), "Stocks" table with Precious Metals + Cash subtotal rows, Precious Metals table (weight, buy price ⓘ, current price, day change, value, % of portfolio, P/L $/%, oz/g toggle), sector table "Precious Metals" row (Gold, Silver) with no warning; Transactions list shows metals in oz. **Browser tests (user A):** 1 oz gold @ $2,000 and 100 g silver @ $1.00/g saved as 1 oz @ $2,000 and 3.215075 oz @ $31.103477 (= $100.00); gold +92.7%, silver $151.99 +52.0%, same values in grams and ounces; asset mix 41.9 + 16.6 + 41.4 = 100%; selling 40 g gold with 31.1 g owned blocked. **Fixed while testing:** grams round-trip artefact (100.000011 g), amounts over $1,000 showing one decimal (now always 2: $10,000.00), metal tickers shown as GC=F/SI=F in the sector table (now Gold, Silver), "shares" wording for metals. 67/67 tests (9 new), lint, types, build, privacy 12/12. |
| Task 11: First deploy to Vercel | ✅ Done 17 Nov | Live at **https://folio-pink-five.vercel.app** (GitHub → Vercel auto-deploy on every push; root directory `folio`; only the two public Supabase values on Vercel, no secret keys). Server functions moved to Stockholm (`arn1`, next to the database): portfolio load 2.8 s → 1.65 s. Security headers added (X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, no X-Powered-By). |
| **Checkpoint C** | ✅ Passed 17 Nov | **Live site:** public pages 200, private pages redirect to login; login as test user A → Portfolio with live prices, cash, metals and asset mix; "apple" → AAPL, buy 2 @ $300 saved → $704.64 / +$104.64 (hand calc ✓), then deleted from Transactions (back to 5 trades); phone layout with bottom bar and no sideways scroll; security headers confirmed live. Privacy test 12/12 against the shared database; 67/67 unit tests; build passes. **Waiting for you:** Supabase Auth URL settings + "Confirm email" choice (see chat). |
| Task 12: Performance engine | ✅ Done 17 Nov | `lib/performance.ts`: daily value series from the first transaction to today (holdings × that day's close, carried over weekends, + cash), money in/out per day, time-weighted return index (deposits never count as gains), ranges 1M/6M/YTD/1Y/5Y/All (clamped to the first trade), range stats (return %, value change, net money added, best and worst day), benchmark rebasing to 0% at the range start. Server loader fetches each stock's stored history + SPY/QQQ/DIA in parallel. Simplification: today's exchange rates are used for past days (noted on the page). 11 new tests pass first time; suite 78/78; lint and types pass. Real-data check happens with the Task 13 page. |
| Task 13: Performance tab | ✅ Done 17 Nov | Line chart (Recharts) of portfolio value or return, ranges 1M · 6M · YTD · 1Y · 5Y · All (remembered), $/% switch, "My Portfolio / vs S&P 500 / vs Nasdaq 100 / vs Dow Jones" dropdown (comparisons always in %, dashed grey benchmark line + legend), hover tooltip, summary cards (Return, Value Change incl. money added, Best Day, Worst Day) and a "beat/trailed by X percentage points" line; loading skeleton, empty state, delayed-data notice, note about closing prices and today's FX. **Real-data checks (user A):** chart renders; the $10,000 sign-up deposit raises $ value but not % (1M return +3.58%, not ~60%); S&P 500 1Y +10.94% matches stored prices exactly (665.67 → 738.49); YTD/1M/All show correct date ranges; no sideways scroll. Page ~1.9 s locally. 78/78 tests, build, privacy 12/12. |
| Task 14: Stock page | ✅ Done 17 Nov | `/stock/[ticker]` opens from every ticker in the Stocks, Precious Metals and Transactions tables: logo, name, exchange, sector, currency; cards for Current Price (+ day change), Your Position, Profit / Loss, Next Earnings ("in N days"); price chart with 1M–5Y ranges (green when up, red when down); Latest News (Finnhub for US, Yahoo for others); Add Transaction opens already on that stock. Metals: price per oz, "Metals don't report earnings", no news. Unknown ticker → "This page has been delisted"; malformed → 404. **Checks:** LLY position 6 × $1,427.64 = $8,565.84, P/L +$3,882.87 (+82.9%), earnings Feb 2, 2027 in 77 days; VOD.L in £ with news; Gold "/ oz". |
| **Checkpoint D** | ✅ Passed 17 Nov | 78/78 tests, types, build, privacy 12/12; deployed; Performance numbers verified (S&P 500 1Y +10.94% matches stored prices; deposits excluded from % return); live stock page loads after deploy and its page data contains no tokens, session data or email (dev-mode debug data is not present in production). |
| Task 15: Settings | ✅ Done 17 Nov | Settings page: avatar upload (Supabase Storage "avatars" bucket, images only, 2 MB, users can only write in their own folder; old photo removed on change), display name (unique, friendly "taken" message), private full name, bio with counter, base currency, alert switches (in-app, email, push), "Publish My Portfolio" (requires a 10+ character bio, prompts and focuses the bio box; server enforces too), account email, change password. Reusable on/off Switch component. **Browser tests (user A):** publishing without a bio blocked (screen + server); base currency → EUR converted everything (cash €9,085.84 = $10,000 × 0.908584 ✓; LLY €7,752.09 ✓), then back to USD; wrong file type rejected; PNG avatar uploaded and shown in the header. **Privacy test now 15/15** incl. storage attacks (B can't upload into or delete from A's folder, can't change A's avatar URL). 5 new tests; suite 83/83; lint, build pass; no sideways scroll at phone width. Supabase scan: only the optional "leaked password protection" setting. |
| Task 16: Public portfolios | ✅ Done 17 Nov | Percent-only "public snapshot" per published user (holding weights of invested assets, sector weights, 1M/YTD/1Y/All returns, weekly % performance line; never amounts, share counts, prices or cash). Database: snapshot readable by signed-in users only while the owner's profile is public (definer helper returns only yes/no), owner-only writes. Snapshot refreshes after publishing, any trade or cash change, and on Portfolio visits when older than 6 h; unpublishing deletes it instantly. Public tab (cards with avatar, bio, holdings count, top sector, 1M/1Y/All returns, "You" badge) and public portfolio page (returns cards, % chart, holdings %, sector weights with guideline bars and warnings). **Tests:** 3 new unit tests (incl. "snapshot never contains amounts/shares/prices/cash"); privacy test now 21/21: B can read A's snapshot, it has no money fields, A's private profile and transactions stay hidden, B can't edit it, and it disappears the moment A goes private. Browser: A's page shows LLY 60.7%, Gold 27.4%, VOD.L 10.9%, Silver 1.1% (= 100%), no "$" anywhere, chart renders. Publish confirmation sped up (snapshot built after the response). |
| Task 17: Follow + bell alerts | ✅ Done 17 Nov | Follow / Following ✓ button (optimistic, "Unfollow" on hover) with follower count on public pages; only public portfolios can be followed (database rule). Database trigger alerts every follower when a published user records a buy or sell ("TesterAlpha bought SPY", never amounts; Gold/Silver named). Header bell with unread badge, dropdown of the latest 15 alerts, click to open (marks read), "Mark All Read", refreshes every 60 s; friendly empty/error states. **Browser test:** B followed A (0 → 1 follower), A bought SPY, B's bell showed "1" and "TesterAlpha bought SPY · just now", Mark All Read cleared it. **Privacy test now 29/29:** B can follow A; B can't create a follow on A's behalf; B gets the alert, with no numbers; A can't read B's alerts or list who follows them; follower count returns a number only; private portfolios can't be followed. |
| **Checkpoint E** | ✅ Passed 17 Nov | 86/86 tests, lint, build; full two-user security test 29/29 (private data hidden, public shows % only, follows/alerts locked down, storage locked down). Supabase scan: two intentional helper functions (yes/no "is public" and a follower count) plus the optional leaked-password setting. |
| Task 18: AI tab | ✅ Done 17 Nov | `ai` Edge Function (OpenRouter key in Supabase secrets, several spellings accepted) with strict guardrails: stocks/sectors/markets/portfolio only, never buy/sell/hold or price targets, declines off-topic, ignores attempts to change its rules. Picks from OpenRouter's current free models (catalog cached, preferred families first, remembers the one that works, 28 s budget). App sends a percentages-only portfolio summary (no amounts, share counts or cash) + Folio's guidelines; chat history saved per user (RLS); fair-use limits 6/min and 60/day protect the free quota; Clear Chat; starter questions; friendly "analyst on a coffee break" errors. **Tests:** 3 unit tests (summary never contains $, share counts or the cash balance); live: portfolio question answered from the holdings, "Should I buy more NVDA?" declined with neutral factors, pizza poem declined; replies 3–7 s. **Bugs fixed:** 27 s replies (outdated model names) and a crash after replies (newer Chrome returns a Promise from scrollIntoView, which React treated as an effect clean-up). |
| Chart feedback (17 Nov) | ✅ Done | Range buttons (1M · 6M · YTD · 1Y · 5Y · All) moved under the Performance and stock price charts, centred inside the card; chart titles shortened to "Performance" and "Price". |
| Task 19: Reminders + daily job | ✅ Done 17 Nov | Reminders tab: each held stock (metals excluded) with its next earnings date, days left and a flag (🔴 Today/Tomorrow, 🟡 Within 10 Days), sorted soonest first, links to stock pages. `daily` Edge Function: computes everyone's current holdings, gets earnings dates (one Finnhub calendar call for US + Yahoo for others) and creates bell alerts at ≤10 days and ≤1 day, once each (dedupe keys), respecting alert settings. Scheduled with pg_cron + pg_net every day at 06:00 UTC; protected by a private secret in a locked table (no API access). **Tests:** wrong secret → 401; run 1 created "TGT reports earnings tomorrow (Nov 18)" and "WMT reports earnings in 2 days (Nov 19)" for user B; run 2 created 0 (no duplicates); the exact scheduled command returned 200. **Verified on the live Vercel site:** Reminders table and bell (2 unread) show both alerts. |
| Task 21b: Landing hero + About + Contact | ✅ Done 17 Nov | **Your request:** new public landing page with a hero section of what Folio delivers: headline "See Your Whole Portfolio, Clearly.", four deliverables with check marks, "Open Your Free Folio" / "Log In" buttons, and a labelled sample dashboard preview (value, asset mix, performance vs S&P 500, sector bars with 25/40% markers, earnings reminder); then features, How It Works (3 steps), privacy promises and a final call to action. Public header (About, Contact, Log In, Sign Up) and a site footer on every page (public and signed-in). About page (what Folio is for, who it helps, what you get, what it doesn't do, your data). Contact page: Khaled Alzayed, alzayed.k@yahoo.com (mailto link + Send An Email button). About/Contact open without login; in the app they're in the header on desktop and in the account menu on phones. **Verified locally and on the live Vercel site:** pages load logged out, desktop hero side by side, phone stacked with no sideways scroll, mailto link correct. |
| Task 20: Email alerts | ⏸ Deferred 17 Nov (your decision) | Skipped for now: Settings shows "Email Alerts · Coming Soon" (disabled); alerts arrive in the bell. |
| Task 21: Installable app (PWA) | ✅ Done 17 Nov (push deferred) | Web app manifest (name, emerald theme, opens on /portfolio, standalone), generated app icons (180/192/512 + maskable), Apple home-screen tags; manifest and icons load without login. Phone push deferred: "Phone Push Alerts · Coming Soon" in Settings. |
| Landing copy update (17 Nov) | ✅ Done | **Your request:** hero now reads "Your Stocks. Your Gold. One Clear View." with a follow / manage / stay-updated message, five benefits (live prices, manage trades, news + earnings for your holdings, sector warnings, returns vs indexes), "Start Tracking Free" button, and a "News And Earnings" feature card. |
| Landing copy tweak (17 Nov) | ✅ Done | **Your request:** removed "manage every trade" and "professional"; hero now says "Follow every stock and precious metal you own, track your returns, and stay ahead with live prices, news on your holdings and earnings alerts, all in one calm dashboard." Verified live. |
| Task 22: Polish | ✅ Done 17 Nov | Accessibility checks on every page (in-page script, since loading an outside checker was blocked): no unnamed buttons or links, no unlabelled inputs, no images without alt text, no duplicate IDs, one heading per page, language set. **Fixed:** tap targets under 24 px (table sort headers, ⓘ tip, ticker links, back links, news links, footer links, toggles) now meet WCAG 2.2's 24 px minimum without changing the look. Title Case misses fixed ("Troy Oz", "Vs. S&P 500", "Log In" tab title). Proper browser-tab titles for Sign Up / Forgot Password / Reset Password and the landing page. Friendly error screen for public pages. Phone pass at 375 px: no sideways scrolling on Portfolio, Transactions, Performance, Settings, AI, stock and public pages. 89/89 tests, lint, build, privacy 29/29, market 25/25; deployed and live pages respond correctly. |
| Task 23: Final verification + demo account | ✅ Done 17 Nov | `scripts/seed-demo.cjs` creates/refreshes a published demo account ("DemoInvestor") with 15 transactions at real historical closing prices: 10 stocks across 9 sectors incl. London and Tokyo, SPY, 3 oz gold, 100 oz silver, a partial NVDA sale, two dividends, $8,500 cash; login saved only in `.env.local` (DEMO_USER_EMAIL / DEMO_USER_PASSWORD). **Live walk-through as the demo user:** Portfolio $83,908.70 with stocks/metals/sectors/cash and warnings; Performance All-time +44.55% vs S&P 500 +24.58% (two lines, title "Performance", ranges under chart); Reminders (NVDA today, others with countdowns); Public tab shows DemoInvestor's % card (snapshot built automatically); Toyota stock page in ¥ with chart and earnings; AI answered using the real sector weights and Folio's guidelines. |
| Change: customizable earnings reminders | ✅ Done 17 Nov | Default is now **7 days and 1 day before**. Settings has an Earnings Reminders section (First Reminder 14/10/7/5/3/2 days; Second Reminder 2 days/1 day/on the day/off; the second must come after the first). Saved in profiles (reminder_first, reminder_second, checked by the database). The daily job reads each user's timing and looks up to 31 days ahead; Reminders tab subtitle and flags follow the user's choice, with a Change link to Settings. **Tests:** 5 new unit tests (94 total pass); daily job run → 200, alerts created with new stage keys; re-run created 0 (no duplicates); old alerts migrated to the new keys. |
| Tasks 24–27: Shariah screening | ✅ Done 17 Nov | `shariah_cache` table (signed-in users can read it; only Edge Functions write) and `profiles.show_shariah` (on by default). New `shariah` action in the `market` function: Yahoo industry, total debt, cash and short-term investments, and market value, with the balance sheet converted into the quote currency, cached 7 days and fetched 5 at a time. Rules live in `lib/shariah.ts` (AAOIFI: business activity, debt under 30%, cash under 30%, the 5% income rule marked "can't be checked"; Shariah ETFs; funds and metals Not Screened). `ShariahBadge` (dot plus words, details pop-over with each rule, data date and scholar note) on stock pages (streamed) and a Shariah column in the holdings table (loaded after the table shows). Settings switch "Show Shariah Screening". **Bug found and fixed:** London market values were wrongly divided by 100 (Yahoo already gives pounds), which made VOD.L show 18,000% debt; it now shows 183%. **Tests:** 10 new unit tests (104 total), 6 new market checks (31 total pass), 29 privacy checks pass, build passes. Real results: AAPL, MSFT, NVDA and TSM Compliant; JPM, BUD, MO and LVS Not Compliant; MAR Doubtful; VOD.L and 7203.T Not Compliant on debt. |
| Tasks 28–34: Multiple portfolios (Real and Paper) | ✅ Done 17 Nov | **Database:** a `portfolios` table (name, Real or Paper, publish flag), capped at 10 per user by a trigger, with names unique per user regardless of case. Trades and cash now belong to a portfolio; RLS only allows writes into your own portfolios. Existing data moved into "My Portfolio" (3 users, all 22 trades, publish choice kept). New sign-ups get "My Portfolio" with their starting cash. Snapshots and follows are per portfolio, and follow alerts name the portfolio ("TesterAlpha (My Portfolio) bought …") and link to `/public/p/<id>`. **App:** a cookie remembers the chosen portfolio (falling back to the first); every loader and save action uses it, while Reminders covers all portfolios. A switcher bar under the tabs (on Portfolio, Transactions, Performance, AI and stock pages) holds **+ New Portfolio** (Name, Real or Paper, starting cash; Paper needs cash) and **Manage** (rename, publish, delete with the name typed to confirm; the last portfolio can't be deleted). Paper labels appear in the switcher, on Public cards and on public pages. **Compare With** on Performance draws other portfolios as % lines with a return-by-portfolio box. The AI is told which portfolio is being viewed and whether it's Paper. Old `/public/<userId>` links redirect. **Bug found and fixed:** after an error, the New Portfolio form cleared what you'd typed (React resets forms that use form actions); it now keeps your input. **Tests:** 114 unit tests (7 new for portfolios, 2 for compare, 2 for the AI), 43 privacy checks (14 new: B can't see, rename, trade or add cash in A's portfolios; the 11th portfolio is refused; duplicate names are refused; deleting removes trades; alerts are per portfolio; you can't follow your own), lint, build. **Checked by hand locally:** Paper with no cash shows the message; created Growth Lab with $10,000 and it became the current portfolio (only its own cash shown); switched back to $23,969; Compare showed +37.04% vs 0.00%; published it and saw a separate Public card with the Paper label; the old link redirected; delete needed the exact name and then fell back to My Portfolio. |
| Change: no cash at sign-up | ✅ Done 17 Nov | Removed Starting Cash and Currency from the sign-up form and its checks. The empty Portfolio page now shows two numbered steps: 1. Add the cash in your account (the Cash card, whose button reads Add Cash until there is cash), and 2. Record your first trade (the Add Transaction button), with a note that both can be skipped. **Live check of multiple portfolios (logged in by you):** created a Paper portfolio with $5,000 (the switcher moved to it and showed only its cash), switched back and forth, then deleted it with the name typed; it fell back to My Portfolio. **Tests:** 113 unit tests, lint and type check pass. |
| Change: Home button, no Day Change column, optional trade date, Paper on About | ✅ Done 17 Nov | **Home:** a Home link with a house icon in the app header (icon only on phones) goes to Portfolio; the public header's Home goes to the landing page, which sends signed-in users to Portfolio. **Day Change:** removed from the holdings and metals tables because it confused people. The Today summary card stays, as do all five cards. The toggle now reads "Show Profit / Loss In". **Trade date:** optional ("Trade Date (Optional)", "Leave empty to use today"). The pop-up fills in the user's local date, and the server falls back to today's date. Performance still starts from the first trade or cash date. **About:** a "Practise With Paper Portfolios" section and a list item. **Tests:** 114 unit tests (new: no date means today), lint and type check pass. |
| Change: warnings under the %, Shariah and Paper on landing and About | ✅ Done 17 Nov | The Warning column is gone from the holdings and sector tables. The OK / High / Very High label now sits under the % in the same cell (like a company name under its ticker), with the guideline in an ⓘ on the % Of Portfolio heading. Landing page: two new feature cards (Shariah Screener, Paper Portfolios) in a 4 by 2 grid. Step 1 no longer mentions entering cash at sign-up. About: Shariah Screening and Paper sections plus list items. **Tests:** 114 unit tests, lint, type check. |
| Change: gold and silver bars and coins (melt value), % first on Performance | ✅ Done 17 Nov | **Performance:** the toggle now reads % then $, and % is the default (stored under a new key so everyone starts on %). Checked live. **Metals:** `lib/metals.ts` gained the tola unit, purity options and a list of 16 coins with official weight and purity (Turkish lira coins, English Lira/Sovereign, Saudi Guinea, 1 oz bullion coins), plus helpers for pure weight and coins still held. New transaction columns `metal_form`, `coin_code`, `coin_count`, `coin_grams` and `purity` are for display only; `shares` stays pure troy oz. The server works out the pure weight of coins itself, so the stored weight always matches the coin. The pop-up has Bar / Pure (unit and purity), Coin (list, count, price per coin, Use Melt Value) and Custom Coin (grams, purity %, count), shows "= X g pure gold", and clears the amount when switching form. Editing reopens in the same form. The metals table shows Pure Weight, coin counts under the metal, and a tola option; the trades list shows "4 × Coin · $/coin". **Tests:** 10 new coin tests (124 total), lint, type check. **Checked by hand locally in a temporary Paper portfolio (deleted afterwards):** 4 Quarter Lira = 6.427 g pure at $199.03 melt per coin; saved at $210 and the P/L showed −$43.87, which is the premium; a 10 g 21k bar = 8.75 g pure with the current price × 87.5%; a custom coin of 2 × 8 g at 90% = 14.4 g pure; selling 1 Quarter Lira left 3; the trades list labels were right; editing reopened as Coin with 4 coins. |
| Change: grams by default, Asset instead of Stock | ✅ Done 18 Nov | Gold/silver weight starts in **Grams** (then Troy Oz, then Tola) in the pop-up and the metals table, and editing a bar reopens in grams. Transactions page: the filter reads **Asset / All Assets** and the first column **Asset**, since metals are listed too. **Tests:** 124 unit tests, lint, type check. |
| Change: separate stocks and metals, final total card, no tola | ✅ Done 18 Nov | The Stocks table no longer has Precious Metals or Cash rows; its footer is **Total Stocks** (value, % of portfolio, P/L in $ or %). The Precious Metals card always shows a **Total Metals** row and has no concentration notes. A new **Total Portfolio Value** card at the end of the page (after Sector Weights and Cash) lists Stocks, Precious Metals and Cash, each with its share, and the Total. Tola removed (grams by default, troy oz optional). **Tests:** 124 unit tests, lint, type check. |
| Fix: Kuwaiti fils, search results size | ✅ Done 18 Nov | Yahoo quotes Boursa Kuwait stocks in **fils (KWF)**. Folio now converts them to **KWD** (÷ 1,000) the way it already handles pence (GBp/GBX), Johannesburg cents (ZAc) and agorot (ILA), so KFH shows 0.765 KWD rather than 765 KWF. The market function was redeployed. Data fix: your KFH buy was changed from 765 KWF to 0.765 KWD, the symbol currency set to KWD, and cached fils quotes, history and Shariah data cleared so they are fetched fresh. Ticker search results now appear inside the pop-up (it grows) instead of a clipped floating list. **Tests:** a new fils unit test, 2 new market checks (33 total pass), 124 unit tests. |
| Fix: no unconverted amounts shown as dollars | ✅ Done 18 Nov | Before, if an exchange rate was missing (as happened with KWF), the raw local amount was shown and summed as if it were in the main currency ($382,500). Now such a holding is flagged: its Total Value shows in its own currency with "Rate to USD unavailable", its % and warning are blank, P/L is in its own currency, and it is left out of the main-currency totals, with an explanation in the alert. Prices stay in each stock's own currency and values in the main currency, as you asked. **Tests:** 2 new tests (KWD converts to USD; a missing rate is never shown as dollars), 126 unit tests, build. |
| Fix: Islamic banks and Takaful are compliant | ✅ Done 18 Nov | KFH (an Islamic bank) showed Not Compliant because every bank failed, and its deposits counted as debt. Folio now recognises Islamic financial institutions from a list of well-known tickers (KFH, Boubyan, Warba, KIB, Al Rajhi, Alinma, Albilad, AlJazira, QIB, Masraf Al Rayan, QIIB, Dukhan, DIB, ADIB) and from company names ("Islamic", "Takaful", "Shariah", "Finance House" and others), on any exchange. They show Compliant (Islamic Bank) or Compliant (Takaful), with the debt and cash ratios marked "Not applicable". Company names are now passed to the screener from the holdings table and stock pages. **Tests:** 4 new tests (KFH; recognition by name; Takaful; a conventional bank still fails), lint, type check. |
| **Final status vs PRD "done" checks (section 9)** | ✅ 13 of 14 | 1 accounts/profile/currency ✅ · 2 buy/sell/dividend for US + international ✅ · 3 holdings columns + $/% + warnings ✅ · 4 sector table = 100% ✅ · 5 cash + deposits excluded from returns ✅ · 6 performance ranges/$/%/benchmarks ✅ · 7 stock price charts ✅ · 8 AI scope + refusals ✅ · 9 reminders 7 days / 1 day by default, customizable ✅ · 10 publish/follow/alerts with no amounts ✅ · 11 in-app alerts ✅, **email and push deferred by your decision** · 12 friendly messages ✅ · 13 About/Contact in header and footer ✅ · 14 tests, build, live site, desktop + phone ✅ · 15 Shariah screening ✅ · 16 multiple portfolios (Real and Paper) ✅ |
