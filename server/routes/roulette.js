const express = require('express');
const router = express.Router();
const { getDb } = require('../db/init');
const { requireAuth } = require('../middleware/auth');

// Roulette slots with multipliers and weights (must sum to 100)
const SLOTS = [
  { name: 'Rotten Banana',  emoji: '🤢', multiplier: 0,   weight: 28 },
  { name: 'Half Peel',      emoji: '🍌', multiplier: 0.5, weight: 15 },
  { name: 'Push',           emoji: '😐', multiplier: 1,   weight: 17 },
  { name: 'Double',         emoji: '🤑', multiplier: 2,   weight: 20 },
  { name: 'Triple',         emoji: '🔥', multiplier: 3,   weight: 12 },
  { name: 'Bunch',          emoji: '🍇', multiplier: 5,   weight: 6  },
  { name: 'Golden Banana',  emoji: '👑', multiplier: 10,  weight: 2  },
];

// Card wager values by rarity
const CARD_VALUES = {
  common: 200,
  rare: 500,
  epic: 1500,
  legendary: 4000,
  chroma_shiny: 8000,
  chroma_rainbow: 15000,
  mystical: 25000,
};

// Rarities that CANNOT be wagered
const UNWAGERABLE = new Set(['bananarang', 'astronomical']);

const MIN_BANANA_WAGER = 100;
const MAX_BANANA_WAGER = 2000;

/**
 * Roll against the weighted slots.
 * Returns the index of the slot that hit.
 */
function rollSlot() {
  const roll = Math.random() * 100;
  let cumulative = 0;
  for (let i = 0; i < SLOTS.length; i++) {
    cumulative += SLOTS[i].weight;
    if (roll < cumulative) return i;
  }
  return SLOTS.length - 1; // fallback
}

// POST /api/roulette/spin
router.post('/spin', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const { wagerType, bananaAmount, inventoryId } = req.body;

  if (wagerType !== 'bananas' && wagerType !== 'card') {
    return res.status(400).json({ error: 'Invalid wager type.' });
  }

  const db = getDb();
  try {
    let wagerValue = 0;
    let cardName = null;
    let cardRarity = null;

    if (wagerType === 'bananas') {
      const amount = parseInt(bananaAmount);
      if (!amount || amount < MIN_BANANA_WAGER || amount > MAX_BANANA_WAGER) {
        return res.status(400).json({ error: `Wager must be between ${MIN_BANANA_WAGER} and ${MAX_BANANA_WAGER} Bananas.` });
      }
      // Check balance
      const user = db.prepare('SELECT bananas FROM users WHERE id = ?').get(userId);
      if (!user || user.bananas < amount) {
        return res.status(400).json({ error: 'Not enough Bananas.' });
      }
      wagerValue = amount;

      // Deduct bananas
      db.prepare('UPDATE users SET bananas = bananas - ? WHERE id = ?').run(amount, userId);

    } else {
      // Card wager
      const invId = parseInt(inventoryId);
      if (!invId) {
        return res.status(400).json({ error: 'Select a card to wager.' });
      }
      const inv = db.prepare(`
        SELECT i.id, i.count, c.name, c.rarity
        FROM inventory i JOIN characters c ON i.character_id = c.id
        WHERE i.id = ? AND i.user_id = ? AND i.count > 0
      `).get(invId, userId);

      if (!inv) {
        return res.status(400).json({ error: 'Card not found in your collection.' });
      }
      if (UNWAGERABLE.has(inv.rarity)) {
        return res.status(400).json({ error: 'That card is too valuable to wager!' });
      }
      if (!CARD_VALUES[inv.rarity]) {
        return res.status(400).json({ error: 'Card rarity not supported for wagering.' });
      }

      wagerValue = CARD_VALUES[inv.rarity];
      cardName = inv.name;
      cardRarity = inv.rarity;

      // Consume 1 copy of the card
      if (inv.count > 1) {
        db.prepare('UPDATE inventory SET count = count - 1 WHERE id = ?').run(invId);
      } else {
        db.prepare('DELETE FROM inventory WHERE id = ?').run(invId);
      }
    }

    // Roll
    const slotIndex = rollSlot();
    const slot = SLOTS[slotIndex];
    const payout = Math.floor(wagerValue * slot.multiplier);

    // Award payout
    if (payout > 0) {
      db.prepare('UPDATE users SET bananas = bananas + ? WHERE id = ?').run(payout, userId);
    }

    // Get updated balance
    const updatedUser = db.prepare('SELECT bananas FROM users WHERE id = ?').get(userId);

    // Record result
    db.prepare(`
      INSERT INTO roulette_results (user_id, wager_type, wager_value, card_name, card_rarity, slot_index, slot_name, multiplier, payout)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, wagerType, wagerValue, cardName, cardRarity, slotIndex, slot.name, slot.multiplier, payout);

    db.close();

    res.json({
      slotIndex,
      slot: {
        name: slot.name,
        emoji: slot.emoji,
        multiplier: slot.multiplier,
      },
      wagerValue,
      payout,
      net: payout - wagerValue,
      bananas: updatedUser.bananas,
    });
  } catch (e) {
    try { db.close(); } catch (ex) {}
    console.error('Roulette spin error:', e);
    res.status(500).json({ error: 'Spin failed. Try again.' });
  }
});

// GET /api/roulette/history — recent spins for the logged-in player
router.get('/history', requireAuth, (req, res) => {
  const db = getDb();
  try {
    const rows = db.prepare(`
      SELECT slot_name, multiplier, wager_type, wager_value, payout, card_name, card_rarity, created_at
      FROM roulette_results
      WHERE user_id = ?
      ORDER BY id DESC LIMIT 20
    `).all(req.session.userId);
    res.json(rows);
  } finally {
    db.close();
  }
});

// GET /api/roulette/slots — return slot config for the frontend
router.get('/slots', requireAuth, (req, res) => {
  res.json({
    slots: SLOTS.map(s => ({ name: s.name, emoji: s.emoji, multiplier: s.multiplier })),
    cardValues: CARD_VALUES,
    unwagerable: [...UNWAGERABLE],
    minBanana: MIN_BANANA_WAGER,
    maxBanana: MAX_BANANA_WAGER,
  });
});

// GET /api/roulette/cards — wagerable cards from player's inventory
router.get('/cards', requireAuth, (req, res) => {
  const db = getDb();
  try {
    const cards = db.prepare(`
      SELECT i.id as inventoryId, c.name, c.rarity, c.image_path, i.count
      FROM inventory i JOIN characters c ON i.character_id = c.id
      WHERE i.user_id = ? AND i.count > 0
        AND c.rarity NOT IN ('bananarang', 'astronomical')
      ORDER BY
        CASE c.rarity
          WHEN 'common' THEN 1
          WHEN 'rare' THEN 2
          WHEN 'epic' THEN 3
          WHEN 'legendary' THEN 4
          WHEN 'chroma_shiny' THEN 5
          WHEN 'chroma_rainbow' THEN 6
          WHEN 'mystical' THEN 7
        END
    `).all(req.session.userId);
    res.json(cards);
  } finally {
    db.close();
  }
});

module.exports = router;
