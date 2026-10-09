const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'bananaet.db');

let SQL = null;

// Helper: wrap sql.js db to match better-sqlite3-like API
function wrapDb(db) {
  return {
    exec(sql) { db.run(sql); },
    prepare(sql) {
      return {
        run(...params) {
          db.run(sql, params);
          const lastId = db.exec('SELECT last_insert_rowid() as id')[0];
          const rowid = lastId ? lastId.values[0][0] : 0;
          return { lastInsertRowid: rowid, changes: db.getRowsModified() };
        },
        get(...params) {
          const stmt = db.prepare(sql);
          stmt.bind(params);
          if (stmt.step()) {
            const cols = stmt.getColumnNames();
            const vals = stmt.get();
            stmt.free();
            const row = {};
            cols.forEach((c, i) => row[c] = vals[i]);
            return row;
          }
          stmt.free();
          return undefined;
        },
        all(...params) {
          const results = [];
          const stmt = db.prepare(sql);
          stmt.bind(params);
          while (stmt.step()) {
            const cols = stmt.getColumnNames();
            const vals = stmt.get();
            const row = {};
            cols.forEach((c, i) => row[c] = vals[i]);
            results.push(row);
          }
          stmt.free();
          return results;
        }
      };
    },
    transaction(fn) {
      return () => {
        db.run('BEGIN TRANSACTION');
        try {
          fn();
          db.run('COMMIT');
        } catch (e) {
          db.run('ROLLBACK');
          throw e;
        }
      };
    },
    close() {
      // Save to disk
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(DB_PATH, buffer);
    },
    _raw: db
  };
}

function getDb() {
  if (!SQL) throw new Error('Database not initialized. Call initialize() first.');
  let db;
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }
  db.run('PRAGMA foreign_keys = ON');
  return wrapDb(db);
}

async function initialize() {
  SQL = await initSqlJs();

  const db = getDb();

  // Run schema
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);

  // Migration: add potassium_level column if it doesn't exist on an older DB
  try {
    db.prepare('SELECT potassium_level FROM inventory LIMIT 1').get();
  } catch (e) {
    db.exec('ALTER TABLE inventory ADD COLUMN potassium_level INTEGER DEFAULT 0');
    console.log('Migration: added potassium_level column to inventory.');
  }

  // Migration: add assigned_to and used_at to invite_codes
  try {
    db.prepare('SELECT assigned_to FROM invite_codes LIMIT 1').get();
  } catch (e) {
    db.exec('ALTER TABLE invite_codes ADD COLUMN assigned_to TEXT');
    console.log('Migration: added assigned_to column to invite_codes.');
  }
  try {
    db.prepare('SELECT used_at FROM invite_codes LIMIT 1').get();
  } catch (e) {
    db.exec('ALTER TABLE invite_codes ADD COLUMN used_at TEXT');
    console.log('Migration: added used_at column to invite_codes.');
  }

  // Migration: create war_results table if it doesn't exist
  db.exec(`CREATE TABLE IF NOT EXISTS war_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player1_id INTEGER REFERENCES users(id),
    player2_id INTEGER REFERENCES users(id),
    winner_id INTEGER REFERENCES users(id),
    player1_total INTEGER NOT NULL,
    player2_total INTEGER NOT NULL,
    is_draw INTEGER DEFAULT 0,
    prize INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  console.log('Migration: ensured war_results table exists.');

  // Migration: create roulette_results table if it doesn't exist
  db.exec(`CREATE TABLE IF NOT EXISTS roulette_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    wager_type TEXT NOT NULL,
    wager_value INTEGER NOT NULL,
    card_name TEXT,
    card_rarity TEXT,
    slot_index INTEGER NOT NULL,
    slot_name TEXT NOT NULL,
    multiplier REAL NOT NULL,
    payout INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  console.log('Migration: ensured roulette_results table exists.');

  // Seed only if empty
  const seasonCount = db.prepare('SELECT COUNT(*) as c FROM seasons').get().c;
  if (seasonCount === 0) {
    seed(db);
  }

  // Backfill potassium levels for any existing inventory entries
  const { backfillPotassium } = require('../potassium');
  backfillPotassium(db);

  db.close();
  console.log('Database initialized.');
}

function seed(db) {
  const seasonResult = db.prepare(
    `INSERT INTO seasons (name, theme) VALUES (?, ?)`
  ).run('Season 1: War of the Worlds', 'War of the Worlds (2005)');
  const seasonId = seasonResult.lastInsertRowid;

  const insertChar = db.prepare(
    `INSERT INTO characters (name, rarity, season_id, image_path) VALUES (?, ?, ?, ?)`
  );

  const characters = [
    ['Fleeing Civilian', 'common', '/img/characters/fleeing-civilian.png'],
    ['News Reporter', 'common', '/img/characters/news-reporter.png'],
    ['Military Soldier', 'common', '/img/characters/military-soldier.png'],
    ['Abandoned Car', 'common', '/img/characters/abandoned-car.png'],
    ['Ferry Passenger', 'common', '/img/characters/ferry-passenger.png'],
    ['Red Weed Patch', 'rare', '/img/characters/red-weed-patch.png'],
    ['Crashed Airplane', 'rare', '/img/characters/crashed-airplane.png'],
    ['EMP Shockwave', 'rare', '/img/characters/emp-shockwave.png'],
    ['Basement Hideout', 'rare', '/img/characters/basement-hideout.png'],
    ['Lightning Storm', 'epic', '/img/characters/lightning-storm.png'],
    ['Alien Probe (Snake-Cam)', 'epic', '/img/characters/alien-probe.png'],
    ['Burning Train', 'epic', '/img/characters/burning-train.png'],
    ['Harvester Machine', 'legendary', '/img/characters/harvester-machine.png'],
    ['Hudson River Ferry', 'legendary', '/img/characters/hudson-river-ferry.png'],
    ['Alien Pilot', 'mystical', '/img/characters/alien-pilot.png'],
    ['The Red Weed Bloom', 'bananarang', '/img/characters/the-red-weed-bloom.png'],
    ['Tripod', 'astronomical', '/img/characters/tripod.png'],
    ['Ray Ferrier', 'astronomical', '/img/characters/ray-ferrier.png'],
    ['Uber Pod', 'astronomical', '/img/characters/uber-pod.png'],
  ];

  const insertMany = db.transaction(() => {
    for (const [name, rarity, imagePath] of characters) {
      insertChar.run(name, rarity, seasonId, imagePath);
    }
  });
  insertMany();

  const insertPack = db.prepare(
    `INSERT INTO packs (name, cost, season_id, max_rarity) VALUES (?, ?, ?, ?)`
  );
  const standardPack = insertPack.run('Standard Pack', 500, seasonId, 'epic');
  const premiumPack = insertPack.run('Premium Pack', 2000, seasonId, 'mystical');
  const ultraPack = insertPack.run('Ultra Pack', 5000, seasonId, 'bananarang');

  const insertOdds = db.prepare(
    `INSERT INTO pack_odds (pack_id, rarity, weight) VALUES (?, ?, ?)`
  );

  insertOdds.run(standardPack.lastInsertRowid, 'common', 55);
  insertOdds.run(standardPack.lastInsertRowid, 'rare', 30);
  insertOdds.run(standardPack.lastInsertRowid, 'epic', 15);

  insertOdds.run(premiumPack.lastInsertRowid, 'common', 35);
  insertOdds.run(premiumPack.lastInsertRowid, 'rare', 28);
  insertOdds.run(premiumPack.lastInsertRowid, 'epic', 20);
  insertOdds.run(premiumPack.lastInsertRowid, 'legendary', 10);
  insertOdds.run(premiumPack.lastInsertRowid, 'chroma_shiny', 4);
  insertOdds.run(premiumPack.lastInsertRowid, 'mystical', 3);

  insertOdds.run(ultraPack.lastInsertRowid, 'common', 25);
  insertOdds.run(ultraPack.lastInsertRowid, 'rare', 25);
  insertOdds.run(ultraPack.lastInsertRowid, 'epic', 20);
  insertOdds.run(ultraPack.lastInsertRowid, 'legendary', 14);
  insertOdds.run(ultraPack.lastInsertRowid, 'chroma_shiny', 8);
  insertOdds.run(ultraPack.lastInsertRowid, 'chroma_rainbow', 4);
  insertOdds.run(ultraPack.lastInsertRowid, 'mystical', 3.5);
  insertOdds.run(ultraPack.lastInsertRowid, 'bananarang', 0.5);

  db.prepare(
    `INSERT INTO invite_codes (code) VALUES (?)`
  ).run('banana1');

  console.log('Seed data loaded: Season 1 characters, packs, and invite code "banana1".');
}

module.exports = { getDb, initialize };
