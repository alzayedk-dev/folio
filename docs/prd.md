# Folio: Product Requirements (PRD), Version 1

*Status: draft for review · Written 17 Nov 2026 · Capstone due about 19 Nov 2026*

---

## 1. What we are building and why

**Folio** is a website, also installable on a phone like an app, for people who buy stocks for themselves and want to track them easily.

Today these investors juggle broker apps, spreadsheets and news sites. Folio puts everything in one place:

- what they own and what it is worth right now
- how much they are up or down, per stock and in total
- whether too much of their money sits in one stock or one sector
- how the whole portfolio has performed since day one, and compared with the market
- upcoming earnings dates for the stocks they own
- an AI helper for stock and market questions
- a community area where people can publish their portfolio and follow others

Folio **monitors**. It never places trades and never tells anyone to buy or sell.

### Who uses it
Self-directed investors who manage their own stocks through one or more brokers. They may be beginners or experienced. They hold US and/or international stocks.

### Capstone requirements this meets
| Requirement | How Folio meets it |
|---|---|
| User login | Sign up / log in with email and password; every user has a profile |
| Database CRUD | Users create, read, edit and delete transactions, cash, follows and profile info |
| External API | Live and historical stock prices, company info, earnings dates, exchange rates, AI |
| Live URL | Hosted on Vercel |

---

## 2. Look and feel

- **Colors:** mostly white background. Emerald green for tabs, buttons, table borders and highlights. Soft grey for secondary text. Red and amber only for losses and warnings.
- **Style:** elegant but simple. Clean font, plenty of white space, rounded cards, thin green table borders.
- **Desktop:** logo on the left of the header, **Settings menu** (avatar) and **bell icon** on the right, emerald **tab bar** under the header.
- **Phone:** the tabs move to a **bottom bar with icons**, like a mobile app. Tables turn into stacked cards.
- **Installable:** users can add Folio to their phone's home screen (PWA, a website that installs like an app).

### Tabs
1. **Portfolio** (home)
2. **Transactions**
3. **Performance**
4. **AI**
5. **Reminders**
6. **Public**

Clicking any ticker opens that **stock's page**.

---

## 3. Features

### 3.1 Accounts and profile
- Sign up with email and password. Log in, log out, reset a forgotten password.
- During sign-up, the user enters their **starting cash** and its currency (can be 0). It counts as their first deposit.
- **Profile (Settings menu in the header):**
  - Display name (**public**, for example "TechBull88")
  - Full name (**private**, only the user sees it)
  - Avatar picture (upload; if none, show initials in a green circle)
  - Short bio / strategy (for example "Long-term dividend investor")
- **Other settings:**
  - Base currency (USD by default; every total is shown in this currency)
  - Alert settings: in-app, email and phone push, each switchable on/off
- **Privacy:** no one can see or change another user's data. The database itself enforces this (row-level security), not just the screens.

### 3.2 Adding a transaction (pop-up)
The user types a ticker or company name (for example "lly" or "Eli Lilly"). Suggestions appear for US and international stocks. Picking one opens a **pop-up** with these fields:

| Field | Notes |
|---|---|
| Ticker + company name | Filled in automatically; current price shown for reference |
| Type | **Buy**, **Sell** or **Dividend** |
| Number of shares | Required for Buy/Sell; must be more than 0 |
| Price per share | Filled in manually, in the stock's own currency |
| Trade date | Defaults to today; can be a past date, never a future one |
| Fees / commission | Optional, defaults to 0 |
| Notes | Optional free text |

- **Dividend:** the user enters the total amount received; it is added to cash.
- **Sell:** the pop-up shows the **proceeds** (shares × price − fees) and the **realized profit/loss** before saving. You cannot sell more shares than you own.
- **After saving:** the stock appears in, or updates, the holdings table straight away.

### 3.3 Transactions tab
- A list of every transaction, newest first: date, ticker, type, shares, price, fees, total, proceeds (for sells), realized P/L (for sells) and notes.
- Filter by ticker and by type.
- Every transaction can be **edited** or **deleted**. Holdings and cash recalculate automatically.
- An "Add transaction" button opens the same pop-up.

### 3.4 Portfolio tab (home)

**Summary cards (top row):**
Total value · Cash · Today's change ($ and %) · Total unrealized P/L · Total realized P/L

**Cash card:**
- Shows cash balances; the user can enter or edit amounts and pick each balance's currency.
- Sells and dividends **add cash automatically**.
- Manual edits (for example moving money to a bank) count as **deposits or withdrawals**, never as gains or losses.

**Holdings table (one row per stock owned):**

| Column | What it shows |
|---|---|
| Ticker / Name | Ticker in bold, company name on a second line in the same cell |
| Shares | Total owned (all buys minus all sells) |
| Avg. purchase price | Average cost per share, including fees |
| Current price | Live (or the latest available) |
| Day change | Today's move; follows the $/% toggle |
| Total value | Shares × current price, converted to the base currency |
| % of portfolio | This stock's value ÷ total portfolio value (cash included) |
| Sector | One of 9 main sectors, or "Other" |
| P/L | Unrealized profit/loss; a **$ / % toggle** above the table switches the view |
| Warning | 🟢 OK · 🟡 Above 10% of portfolio · 🔴 Above 20% of portfolio |

- A totals row at the bottom.
- Sort by any column.

**Sector table (under the holdings):**

| Column | What it shows |
|---|---|
| Sector | Technology, Communication Services, Healthcare, Financials & Real Estate, Consumer Discretionary, Consumer Staples, Industrials & Materials, Energy, Utilities, Other |
| Weight | Sum of the "% of portfolio" of every stock in that sector |
| Thresholds | 25% / 40% |
| Warning | 🟢 OK · 🟡 Above 25% · 🔴 Above 40% |

- A donut chart of the sector weights next to the table.
- The warning thresholds come from common investing rules of thumb. They are shown as **guidelines, not advice**.

### 3.5 Stock page
Opens when a ticker is clicked.
- Company name, logo (if available), exchange, currency, sector
- Current price and day change
- **Price chart** with 1M · 6M · YTD · 1Y · 5Y ranges
- Latest news (where available)
- Next earnings date (where available)
- The user's own position in this stock: shares, average cost, P/L
- "Add transaction" button

### 3.6 Performance tab
- A line chart of the **total portfolio value** from the first transaction until today.
- Ranges: **1M · 6M · YTD · 1Y · 5Y · All time**
- **$ / % toggle:** $ shows the value in the base currency; % shows the return.
- **Dropdown:** "My portfolio" or "vs benchmark": S&P 500, Nasdaq 100 or Dow Jones.
- The % return ignores deposits and withdrawals (time-weighted return), so adding cash never looks like a gain.
- Under the chart: the return for the selected range, the best day and the worst day.

### 3.7 AI tab
- A chat box with saved conversation history.
- The AI **knows the user's holdings**: tickers, weights and sectors.
- It **only** answers questions about stocks, sectors, markets and the user's portfolio make-up.
- It **never** says buy, sell or hold, and never predicts prices. It politely declines off-topic questions.
- A short note under the chat: "Folio's AI explains, it doesn't advise. Not financial advice."
- Uses free AI models through OpenRouter.

### 3.8 Reminders tab
- Lists upcoming earnings dates for every stock the user holds.
- Flags each one **10 days before** and **1 day before**.
- Each flag also creates an alert (see 3.10).

### 3.9 Public portfolios
- **Settings → "Publish my portfolio"** checkbox. When it is ticked, Folio asks for a bio/strategy if the user hasn't written one.
- **Public tab:** a list of published portfolios showing display name, bio, number of stocks, and return % (1M / 1Y / All).
- Opening one shows, **in % only, with no dollar amounts, share counts or cash**:
  - holdings with their % weights and sectors
  - the sector table with warnings
  - the performance chart in %
- **Copying is manual:** users buy in their own broker app, then record the trades in Folio.
- **Follow button:** the follower gets an alert whenever the owner buys or sells, for example "TechBull88 bought LLY" or "TechBull88 sold part of NVDA". Alerts never show the owner's amounts.
- Unticking the checkbox hides the portfolio straight away.

### 3.10 Alerts
- **In-app:** a bell icon with an unread count, plus a dropdown list.
- **Email:** sent through Resend (free plan).
- **Phone push:** browser/phone notifications through the PWA. *Cut first if time runs short.*
- **What creates an alert:** earnings in 10 days or 1 day; a followed portfolio's owner trades.
- The user controls each channel in Settings.

### 3.11 Friendly messages
Every loading, error, wrong-input and busy-server message is friendly and uses finance language. Examples:

| Situation | Message |
|---|---|
| Loading | "Crunching your numbers…" |
| Market data slow or down | "The market feed is catching its breath. Showing prices as of 2:41 PM." |
| Server busy | "Trading floor's packed right now, give it a moment and try again." |
| Unknown ticker | "That ticker isn't trading on our floor. Check the symbol?" |
| Selling more than owned | "You can't sell shares you don't own (that would be shorting, and Folio doesn't do that)." |
| Empty portfolio | "Your portfolio is a blank ledger. Add your first trade to get started." |
| AI busy | "Our analyst is on a coffee break. Try again in a minute." |
| Page not found | "This page has been delisted." |

---

## 4. Rules for the numbers

- **Shares owned** = all bought − all sold.
- **Average cost** = (total paid for buys + buy fees) ÷ shares bought. Selling does not change the average cost of the shares that remain.
- **Realized P/L on a sell** = (sell price − average cost) × shares sold − sell fees.
- **Proceeds** = shares × sell price − fees, added to cash.
- **Unrealized P/L** = (current price − average cost) × shares. P/L % = P/L ÷ (average cost × shares).
- **Total portfolio value** = sum of holdings' values + cash, all in the base currency.
- **% of portfolio** = holding value ÷ total portfolio value.
- **Currency:** each stock keeps its own currency. Values are converted to the base currency with daily exchange rates.
- **Buying with cash:** a buy uses available cash first. If there isn't enough, the missing amount is counted as new money deposited, so performance stays correct. *(Decided.)*

---

## 5. Where the data comes from (all free)

| Need | Source |
|---|---|
| Login, database, file storage (avatars) | Supabase (free plan) |
| US live prices, company profile/sector, news, US earnings dates | Finnhub (free key) |
| International stocks, price history (all stocks), international earnings, backup for US | Yahoo Finance through the unofficial `yahoo-finance2` library |
| Exchange rates | Free exchange-rate API (open.er-api.com), with Yahoo as backup |
| AI chat | OpenRouter free models |
| Email | Resend (free plan) |
| Hosting + daily scheduled job | Vercel (free plan) |

- **Fallback:** if one source fails, Folio tries the other, then shows the last saved price with a friendly note.
- **Saving data:** live prices are kept for about 60 seconds and shared by all users. Price history is saved permanently and topped up daily. This keeps us inside free limits.
- **One adapter:** all market-data code sits in one place, so a paid provider can replace Yahoo later.

---

## 6. Technology (for the build)

- **Next.js 15** (App Router, TypeScript) + **Tailwind CSS 4**, already set up in `folio/`
- **Supabase** (Postgres, Auth, Storage, row-level security)
- **Recharts** for charts
- **yahoo-finance2**, Finnhub REST, OpenRouter, Resend, **web-push**
- **Vitest** for tests of the number rules
- **Vercel** for hosting and the daily scheduled job (earnings reminders)

**Commands** (run inside `folio/`):
```
npm run dev      # start locally at http://localhost:3000
npm run build    # production build
npm run lint     # code checks
npm test         # unit tests (Vitest)
```

**Folder layout:**
```
folio/
  app/            pages and API routes
  components/     UI pieces (tables, pop-up, charts, cards)
  lib/            calculations, market-data adapter, Supabase clients, messages
  lib/__tests__/  unit tests
  supabase/       database schema and security rules (SQL)
  public/         icons, PWA manifest, service worker
docs/             this PRD and the build plan
```

---

## 7. How we will test it

- **Unit tests (Vitest)** for every number rule in section 4: average cost, realized P/L, % weights, sector sums, warnings, currency conversion and time-weighted return. The worked example must pass: AAPL $2,300 + NVDA $700 + JPM $1,000 + XOM $1,000 → Technology 60%, Financials & Real Estate 20%, Energy 20%.
- **Security check:** log in as two users and confirm neither can see or change the other's data, and that a public portfolio shows % only.
- **Click-through test** in a browser at desktop and phone width for every tab.
- **Live test** on the Vercel URL before submission.

---

## 8. Ground rules for building

- **Always:** keep API keys on the server only; check every user input; make every error message friendly; run the tests and build before each milestone.
- **Ask first:** adding a paid service; big changes to the database design; removing a feature.
- **Never:** commit secrets (`.env.local` stays out of git); show buy/sell advice; let one user read another user's private data.

---

## 9. How we know it's done

1. A new user can sign up, set a profile, and choose a base currency.
2. They can add, edit and delete Buy, Sell and Dividend transactions through the pop-up, for US and international stocks.
3. The holdings table shows every column in 3.4 correctly, with the $/% toggle and warnings.
4. The sector table and donut add up to 100% with the right warnings.
5. Sells and dividends update cash; manual cash edits don't distort performance.
6. The performance chart works for every range, in $ and %, with and without a benchmark.
7. Stock pages show a price chart for every range.
8. The AI answers stock questions using the user's holdings and refuses buy/sell or off-topic questions.
9. Reminders list earnings dates and flag them at 10 days and 1 day.
10. Publishing, the Public tab, following, and follow alerts work, with no dollar amounts leaked.
11. In-app and email alerts work. Push works on at least desktop Chrome and Android (or is marked "coming soon" if cut).
12. Every error and loading state uses a friendly finance message.
13. All unit tests pass, the production build succeeds, and the app works on the live Vercel URL at desktop and phone width.

---

## 10. Not in version 1

- Connecting to broker accounts (Plaid etc.): too complex for the deadline
- Placing trades: Folio only monitors
- Automatic portfolio copying: users copy by hand
- Buy/sell recommendations or price predictions: legal and ethical reasons
- Options, crypto, bonds and mutual-fund-only holdings: stocks and ETFs only for now
- Tax reports: later

---

## 11. Decisions made (17 Nov 2026)

1. **Buying without enough cash:** the missing amount counts as new money deposited (cash never goes negative).
2. **Starting cash:** new users enter their starting cash balance and its currency during sign-up (it can be 0). It counts as their first deposit.
3. **Folder name:** the app lives in `folio/`.
4. **Push on iPhone:** works only after the user taps Share → "Add to Home Screen" (an Apple rule). Android phones and computers work straight from the browser. *Waiting for confirmation.*
