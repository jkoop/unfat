import { Database } from "bun:sqlite";
import { join } from "path";

const DATA_DIR = process.env.DATA_DIR ?? "./data";
const DB_PATH = join(DATA_DIR, "unfat.db");

let _db: Database | null = null;

export function getDb(): Database {
  if (_db) return _db;
  _db = new Database(DB_PATH, { create: true });
  _db.run("PRAGMA journal_mode = WAL");
  _db.run("PRAGMA foreign_keys = ON");
  migrate(_db);
  seed(_db);
  return _db;
}

function migrate(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      is_disabled INTEGER NOT NULL DEFAULT 0,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      unit_mass TEXT NOT NULL DEFAULT 'g',
      unit_volume TEXT NOT NULL DEFAULT 'ml',
      unit_water TEXT NOT NULL DEFAULT 'fl oz',
      unit_food_weight TEXT NOT NULL DEFAULT 'g',
      unit_user_weight TEXT NOT NULL DEFAULT 'lbs',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS food_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      taken_at TEXT NOT NULL,
      photo_path TEXT,
      description TEXT,
      ollama_status TEXT NOT NULL DEFAULT 'no_photo',
      ollama_description TEXT,

      calories_kcal REAL,
      water_g REAL,
      salt_mg REAL,
      sugar_g REAL,
      fibre_g REAL,
      caffeine_mg REAL,
      calcium_mg REAL,
      iron_mg REAL,
      magnesium_mg REAL,
      potassium_mg REAL,
      zinc_mg REAL,
      vitamin_a_mcg REAL,
      vitamin_c_mg REAL,
      vitamin_d_mcg REAL,
      vitamin_e_mg REAL,
      vitamin_b12_mcg REAL,

      ai_calories_kcal REAL,
      ai_water_g REAL,
      ai_salt_mg REAL,
      ai_sugar_g REAL,
      ai_fibre_g REAL,
      ai_caffeine_mg REAL,
      ai_calcium_mg REAL,
      ai_iron_mg REAL,
      ai_magnesium_mg REAL,
      ai_potassium_mg REAL,
      ai_zinc_mg REAL,
      ai_vitamin_a_mcg REAL,
      ai_vitamin_c_mg REAL,
      ai_vitamin_d_mcg REAL,
      ai_vitamin_e_mg REAL,
      ai_vitamin_b12_mcg REAL,

      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sleep_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      score INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS weight_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      weight REAL NOT NULL,
      measured_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS ollama_jobs (
      id TEXT PRIMARY KEY,
      food_entry_id INTEGER NOT NULL REFERENCES food_entries(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  ensureColumn(db, "food_entries", "water_g", "REAL");
  ensureColumn(db, "food_entries", "ai_water_g", "REAL");

  // Default settings
  db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('ollama_url', 'http://localhost:11434')`);
  db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('ollama_model', 'llava')`);
}

function ensureColumn(db: Database, table: string, column: string, definition: string) {
  const existing = db.query<{ name: string }, []>(`PRAGMA table_info(${table})`).all();
  if (existing.some((row) => row.name === column)) return;
  db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

async function seed(db: Database) {
  const existing = db.query("SELECT id FROM users WHERE is_admin = 1").get();
  if (!existing) {
    const hash = await Bun.password.hash("admin");
    db.run(
      `INSERT INTO users (username, password_hash, is_admin, must_change_password)
       VALUES ('admin', ?, 1, 1)`,
      [hash]
    );
    console.log("[db] Created default admin user (admin/admin)");
  }
}

export function getSetting(key: string): string | null {
  const db = getDb();
  const row = db.query<{ value: string }, [string]>(
    "SELECT value FROM settings WHERE key = ?"
  ).get(key);
  return row?.value ?? null;
}

export function setSetting(key: string, value: string) {
  const db = getDb();
  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, value]);
}

export type User = {
  id: number;
  username: string;
  password_hash: string;
  is_admin: number;
  is_disabled: number;
  must_change_password: number;
  unit_mass: string;
  unit_volume: string;
  unit_water: string;
  unit_food_weight: string;
  unit_user_weight: string;
  created_at: string;
};

export type FoodEntry = {
  id: number;
  user_id: number;
  taken_at: string;
  photo_path: string | null;
  description: string | null;
  ollama_status: string;
  ollama_description: string | null;
  calories_kcal: number | null;
  water_g: number | null;
  salt_mg: number | null;
  sugar_g: number | null;
  fibre_g: number | null;
  caffeine_mg: number | null;
  calcium_mg: number | null;
  iron_mg: number | null;
  magnesium_mg: number | null;
  potassium_mg: number | null;
  zinc_mg: number | null;
  vitamin_a_mcg: number | null;
  vitamin_c_mg: number | null;
  vitamin_d_mcg: number | null;
  vitamin_e_mg: number | null;
  vitamin_b12_mcg: number | null;
  ai_calories_kcal: number | null;
  ai_water_g: number | null;
  ai_salt_mg: number | null;
  ai_sugar_g: number | null;
  ai_fibre_g: number | null;
  ai_caffeine_mg: number | null;
  ai_calcium_mg: number | null;
  ai_iron_mg: number | null;
  ai_magnesium_mg: number | null;
  ai_potassium_mg: number | null;
  ai_zinc_mg: number | null;
  ai_vitamin_a_mcg: number | null;
  ai_vitamin_c_mg: number | null;
  ai_vitamin_d_mcg: number | null;
  ai_vitamin_e_mg: number | null;
  ai_vitamin_b12_mcg: number | null;
  created_at: string;
  updated_at: string;
};

export type SleepEntry = {
  id: number;
  user_id: number;
  start_time: string;
  end_time: string;
  score: number | null;
  created_at: string;
  updated_at: string;
};

export type WeightEntry = {
  id: number;
  user_id: number;
  weight: number;
  measured_at: string;
  created_at: string;
  updated_at: string;
};

export const NUTRIENT_FIELDS = [
  "calories_kcal",
  "water_g",
  "salt_mg",
  "sugar_g",
  "fibre_g",
  "caffeine_mg",
  "calcium_mg",
  "iron_mg",
  "magnesium_mg",
  "potassium_mg",
  "zinc_mg",
  "vitamin_a_mcg",
  "vitamin_c_mg",
  "vitamin_d_mcg",
  "vitamin_e_mg",
  "vitamin_b12_mcg",
] as const;

export type NutrientField = (typeof NUTRIENT_FIELDS)[number];

export const NUTRIENT_LABELS: Record<NutrientField, string> = {
  calories_kcal: "Calories (kcal)",
  water_g: "Water (g)",
  salt_mg: "Salt (mg)",
  sugar_g: "Sugar (g)",
  fibre_g: "Fibre (g)",
  caffeine_mg: "Caffeine (mg)",
  calcium_mg: "Calcium (mg)",
  iron_mg: "Iron (mg)",
  magnesium_mg: "Magnesium (mg)",
  potassium_mg: "Potassium (mg)",
  zinc_mg: "Zinc (mg)",
  vitamin_a_mcg: "Vitamin A (mcg)",
  vitamin_c_mg: "Vitamin C (mg)",
  vitamin_d_mcg: "Vitamin D (mcg)",
  vitamin_e_mg: "Vitamin E (mg)",
  vitamin_b12_mcg: "Vitamin B12 (mcg)",
};
