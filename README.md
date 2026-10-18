# DUB

Your Fortnite wins, paid in SOL. Register an Epic name and a Solana wallet, win battle royale, and every Victory Royale
earns a share of the day's $DUB creator fees. Most dubs in 24 hours becomes the dev.

- `api/_config.js`: CA, X link, dev cut, daily cap, hold requirement.
- Env: `DATABASE_URL` (Neon), `FNAPI_KEY` (fortnite-api.com key), optional `RPC_URL`, `DUB_CA`, `DUB_X`, `DUB_PAYER`.
- Vercel Cron runs `/api/tick` every minute: closes finished days, reads the creator vaults, reads every player's stats, matches payouts on-chain.
