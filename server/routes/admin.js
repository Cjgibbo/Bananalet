const express = require('express');
const router = express.Router();
const { getDb } = require('../db/init');
const { requireAuth, requireOwner } = require('../middleware/auth');

// Give bananas to a user (owner only)
router.post('/bananas', requireAuth, requireOwner, (req, res) => {
  const { userId, amount } = req.body;
  const targetId = userId || req.session.userId; // default to self

  const db = getDb();
  try {
    db.prepare('UPDATE users SET bananas = ? WHERE id = ?').run(amount, targetId);
    const user = db.prepare('SELECT id, username, bananas FROM users WHERE id = ?').get(targetId);
    db.close();
    res.json({ success: true, user });
  } catch (e) {
    db.close();
    res.status(500).json({ error: e.message });
  }
});

// Generate invite codes (owner only)
router.post('/invite-codes', requireAuth, requireOwner, (req, res) => {
  const { codes, assignedTo } = req.body;
  if (!codes || !Array.isArray(codes)) {
    return res.status(400).json({ error: 'Provide an array of codes' });
  }
  if (!assignedTo || !assignedTo.trim()) {
    return res.status(400).json({ error: 'Provide a name for who this code is for' });
  }

  const db = getDb();
  try {
    const insert = db.prepare('INSERT INTO invite_codes (code, assigned_to, created_by) VALUES (?, ?, ?)');
    const created = [];
    for (const code of codes) {
      try {
        insert.run(code.trim(), assignedTo.trim(), req.session.userId);
        created.push(code.trim());
      } catch (e) {
        // duplicate code, skip
      }
    }
    db.close();
    res.json({ success: true, created });
  } catch (e) {
    db.close();
    res.status(500).json({ error: e.message });
  }
});

// List all users (owner only)
router.get('/users', requireAuth, requireOwner, (req, res) => {
  const db = getDb();
  try {
    const users = db.prepare(
      'SELECT id, username, bananas, is_owner, banned, muted, created_at, last_login FROM users WHERE is_superadmin = 0'
    ).all();
    res.json(users);
  } finally {
    db.close();
  }
});

// Ban/unban a user (owner only)
router.post('/ban', requireAuth, requireOwner, (req, res) => {
  const { userId, banned } = req.body;
  const db = getDb();
  try {
    db.prepare('UPDATE users SET banned = ? WHERE id = ?').run(banned ? 1 : 0, userId);
    db.close();
    res.json({ success: true });
  } catch (e) {
    db.close();
    res.status(500).json({ error: e.message });
  }
});

// Mute/unmute a user (owner only)
router.post('/mute', requireAuth, requireOwner, (req, res) => {
  const { userId, muted } = req.body;
  const db = getDb();
  try {
    db.prepare('UPDATE users SET muted = ? WHERE id = ?').run(muted ? 1 : 0, userId);
    db.close();
    res.json({ success: true });
  } catch (e) {
    db.close();
    res.status(500).json({ error: e.message });
  }
});

// Create a badge (owner only)
router.post('/badges', requireAuth, requireOwner, (req, res) => {
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Badge name required' });

  const db = getDb();
  try {
    const result = db.prepare(
      'INSERT INTO badges (name, color, created_by) VALUES (?, ?, ?)'
    ).run(name.trim(), color || '#FFD700', req.session.userId);
    db.close();
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (e) {
    db.close();
    res.status(500).json({ error: e.message });
  }
});

// List all badges
router.get('/badges', requireAuth, requireOwner, (req, res) => {
  const db = getDb();
  try {
    const badges = db.prepare('SELECT * FROM badges ORDER BY created_at DESC').all();
    res.json(badges);
  } finally {
    db.close();
  }
});

// Assign a badge to a user (owner only)
router.post('/badges/assign', requireAuth, requireOwner, (req, res) => {
  const { userId, badgeId } = req.body;
  if (!userId || !badgeId) return res.status(400).json({ error: 'userId and badgeId required' });

  const db = getDb();
  try {
    db.prepare(
      'INSERT OR IGNORE INTO user_badges (user_id, badge_id) VALUES (?, ?)'
    ).run(userId, badgeId);
    db.close();
    res.json({ success: true });
  } catch (e) {
    db.close();
    res.status(500).json({ error: e.message });
  }
});

// Remove a badge from a user (owner only)
router.post('/badges/remove', requireAuth, requireOwner, (req, res) => {
  const { userId, badgeId } = req.body;
  const db = getDb();
  try {
    db.prepare('DELETE FROM user_badges WHERE user_id = ? AND badge_id = ?').run(userId, badgeId);
    db.close();
    res.json({ success: true });
  } catch (e) {
    db.close();
    res.status(500).json({ error: e.message });
  }
});

// ===== ASTRONOMICAL MANAGEMENT =====

// List all astronomical characters
router.get('/astronomical/characters', requireAuth, requireOwner, (req, res) => {
  const db = getDb();
  try {
    const chars = db.prepare(
      "SELECT * FROM characters WHERE rarity = 'astronomical' ORDER BY id"
    ).all();
    res.json(chars);
  } finally {
    db.close();
  }
});

// Mint an astronomical character into the owner's inventory
router.post('/astronomical/mint', requireAuth, requireOwner, (req, res) => {
  const { characterId } = req.body;
  if (!characterId) return res.status(400).json({ error: 'characterId required' });

  const db = getDb();
  try {
    // Verify the character exists and is astronomical
    const char = db.prepare(
      "SELECT * FROM characters WHERE id = ? AND rarity = 'astronomical'"
    ).get(characterId);
    if (!char) {
      db.close();
      return res.status(404).json({ error: 'Astronomical character not found' });
    }

    // Add to owner's inventory (increment if already owned)
    const existing = db.prepare(
      'SELECT id, count FROM inventory WHERE user_id = ? AND character_id = ?'
    ).get(req.session.userId, characterId);

    if (existing) {
      db.prepare('UPDATE inventory SET count = count + 1 WHERE id = ?').run(existing.id);
    } else {
      const { rollPotassium } = require('../potassium');
      const potassiumLevel = rollPotassium('astronomical');
      db.prepare(
        'INSERT INTO inventory (user_id, character_id, potassium_level) VALUES (?, ?, ?)'
      ).run(req.session.userId, characterId, potassiumLevel);
    }

    db.close();
    res.json({ success: true, character: char });
  } catch (e) {
    db.close();
    res.status(500).json({ error: e.message });
  }
});

// Gift an astronomical from owner's inventory to another player
router.post('/astronomical/gift', requireAuth, requireOwner, (req, res) => {
  const { characterId, targetUserId } = req.body;
  if (!characterId || !targetUserId) {
    return res.status(400).json({ error: 'characterId and targetUserId required' });
  }

  const db = getDb();
  try {
    // Verify character is astronomical
    const char = db.prepare(
      "SELECT * FROM characters WHERE id = ? AND rarity = 'astronomical'"
    ).get(characterId);
    if (!char) {
      db.close();
      return res.status(404).json({ error: 'Astronomical character not found' });
    }

    // Verify target user exists
    const target = db.prepare('SELECT id, username FROM users WHERE id = ?').get(targetUserId);
    if (!target) {
      db.close();
      return res.status(404).json({ error: 'Target user not found' });
    }

    // Verify owner has this character in inventory
    const ownerInv = db.prepare(
      'SELECT id, count, potassium_level FROM inventory WHERE user_id = ? AND character_id = ?'
    ).get(req.session.userId, characterId);
    if (!ownerInv || ownerInv.count < 1) {
      db.close();
      return res.status(400).json({ error: 'You do not have this character in your inventory' });
    }

    // Transaction: remove from owner, add to target
    const execute = db.transaction(() => {
      // Remove one from owner
      if (ownerInv.count === 1) {
        db.prepare('DELETE FROM inventory WHERE id = ?').run(ownerInv.id);
      } else {
        db.prepare('UPDATE inventory SET count = count - 1 WHERE id = ?').run(ownerInv.id);
      }

      // Add to target (increment if already owned, preserve potassium)
      const targetInv = db.prepare(
        'SELECT id FROM inventory WHERE user_id = ? AND character_id = ?'
      ).get(targetUserId, characterId);

      if (targetInv) {
        db.prepare('UPDATE inventory SET count = count + 1 WHERE id = ?').run(targetInv.id);
      } else {
        db.prepare(
          'INSERT INTO inventory (user_id, character_id, potassium_level) VALUES (?, ?, ?)'
        ).run(targetUserId, characterId, ownerInv.potassium_level);
      }
    });
    execute();

    db.close();
    res.json({ success: true, character: char, recipient: target.username });
  } catch (e) {
    db.close();
    res.status(500).json({ error: e.message });
  }
});

// Create a new astronomical character
router.post('/astronomical/create', requireAuth, requireOwner, (req, res) => {
  const { name, imagePath } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Character name required' });
  }

  const db = getDb();
  try {
    // Get the active season
    const season = db.prepare('SELECT id FROM seasons WHERE active = 1 LIMIT 1').get();
    if (!season) {
      db.close();
      return res.status(500).json({ error: 'No active season found' });
    }

    const result = db.prepare(
      'INSERT INTO characters (name, rarity, season_id, image_path) VALUES (?, ?, ?, ?)'
    ).run(name.trim(), 'astronomical', season.id, imagePath || null);

    db.close();
    res.json({
      success: true,
      character: {
        id: result.lastInsertRowid,
        name: name.trim(),
        rarity: 'astronomical',
        season_id: season.id,
        image_path: imagePath || null
      }
    });
  } catch (e) {
    db.close();
    res.status(500).json({ error: e.message });
  }
});

// Get owner's astronomical inventory (for gifting UI)
router.get('/astronomical/inventory', requireAuth, requireOwner, (req, res) => {
  const db = getDb();
  try {
    const items = db.prepare(`
      SELECT i.id as inventory_id, i.count, i.potassium_level,
             c.id as character_id, c.name, c.rarity, c.image_path
      FROM inventory i
      JOIN characters c ON c.id = i.character_id
      WHERE i.user_id = ? AND c.rarity = 'astronomical'
      ORDER BY c.name
    `).all(req.session.userId);
    res.json(items);
  } finally {
    db.close();
  }
});

// ===== LUCK BOOST =====

// Get active luck boost status
router.get('/boost/status', requireAuth, (req, res) => {
  const db = getDb();
  try {
    const boost = db.prepare(`
      SELECT lb.*, u.username as activated_by_name
      FROM luck_boosts lb
      JOIN users u ON u.id = lb.activated_by
      WHERE lb.active = 1
      AND datetime(lb.started_at, '+' || lb.duration_minutes || ' minutes') > datetime('now')
      ORDER BY lb.started_at DESC LIMIT 1
    `).get();

    if (boost) {
      const startedAt = new Date(boost.started_at + 'Z');
      const endsAt = new Date(startedAt.getTime() + boost.duration_minutes * 60000);
      res.json({
        active: true,
        multiplier: boost.multiplier,
        endsAt: endsAt.toISOString(),
        activatedBy: boost.activated_by_name
      });
    } else {
      res.json({ active: false });
    }
  } finally {
    db.close();
  }
});

// Activate luck boost (owner only)
router.post('/boost/activate', requireAuth, requireOwner, (req, res) => {
  const { multiplier, durationMinutes } = req.body;
  const validMultipliers = [5, 10, 25];
  if (!validMultipliers.includes(multiplier)) {
    return res.status(400).json({ error: 'Multiplier must be 5, 10, or 25' });
  }
  if (!durationMinutes || durationMinutes < 1 || durationMinutes > 120) {
    return res.status(400).json({ error: 'Duration must be 1-120 minutes' });
  }

  const db = getDb();
  try {
    // Deactivate any existing boost
    db.prepare('UPDATE luck_boosts SET active = 0 WHERE active = 1').run();

    // Create new boost
    const result = db.prepare(
      'INSERT INTO luck_boosts (multiplier, duration_minutes, activated_by) VALUES (?, ?, ?)'
    ).run(multiplier, durationMinutes, req.session.userId);

    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime() + durationMinutes * 60000);

    db.close();

    // Broadcast to all connected clients
    const io = req.app.get('io');
    if (io) {
      io.emit('boost:activated', {
        multiplier,
        durationMinutes,
        endsAt: endsAt.toISOString()
      });
    }

    res.json({
      success: true,
      boost: {
        id: result.lastInsertRowid,
        multiplier,
        durationMinutes,
        endsAt: endsAt.toISOString()
      }
    });
  } catch (e) {
    db.close();
    res.status(500).json({ error: e.message });
  }
});

// Deactivate luck boost (owner only)
router.post('/boost/deactivate', requireAuth, requireOwner, (req, res) => {
  const db = getDb();
  try {
    db.prepare('UPDATE luck_boosts SET active = 0 WHERE active = 1').run();
    db.close();

    // Broadcast end to all clients
    const io = req.app.get('io');
    if (io) {
      io.emit('boost:ended');
    }

    res.json({ success: true });
  } catch (e) {
    db.close();
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
