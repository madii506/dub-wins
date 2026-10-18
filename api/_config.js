// DUB settings. CA and X go live the moment they are filled in (or set DUB_CA / DUB_X on Vercel).
module.exports = {
  CA: process.env.DUB_CA || '',            // $DUB mint
  X: process.env.DUB_X || '',              // https://x.com/<handle>
  PAYER: process.env.DUB_PAYER || '',      // wallet that sends payouts; empty = the coin's creator (read from the bonding curve)
  DEV_PCT: 25,                             // the dev's cut of the day's pot
  CAP: 10,                                 // paid dubs per account per day
  MIN_HOLD: 50000,                         // $DUB the payout wallet must hold at payday (checked once the CA is set)
  MODES: ['solo', 'duo', 'trio', 'squad'], // battle royale only, LTMs excluded
  CLAIM_MIN: 30,                           // minutes to finish the "prove it's you" step
  WIN_MIN: 10,                             // a Victory Royale takes at least this many minutes; caps impossible jumps
  // the arena: 1v1 aim duels for SOL
  FEE_WALLET: process.env.DUB_FEE_WALLET || '', // where the 5% duel fee goes; empty = the coin's creator wallet
  DUEL_FEE_PCT: 5,                         // of the pot (both stakes)
  STAKES: [0.05, 0.1, 0.25, 0.5, 1],       // SOL per side
};
