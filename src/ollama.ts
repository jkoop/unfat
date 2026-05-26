import { getSetting } from "./db.ts";
import { join } from "path";
import { readFile } from "fs/promises";

const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export type OllamaResult = {
  description: string;
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
};

const PROMPT = `You are a nutrition analysis assistant. Analyze the food and drink in this image.

Respond ONLY with a JSON object (no markdown, no extra text) in exactly this format:
{
  "description": "Brief description of what you see",
  "calories_kcal": <number or null>,
  "water_g": <number or null>,
  "salt_mg": <number or null>,
  "sugar_g": <number or null>,
  "fibre_g": <number or null>,
  "caffeine_mg": <number or null>,
  "calcium_mg": <number or null>,
  "iron_mg": <number or null>,
  "magnesium_mg": <number or null>,
  "potassium_mg": <number or null>,
  "zinc_mg": <number or null>,
  "vitamin_a_mcg": <number or null>,
  "vitamin_c_mg": <number or null>,
  "vitamin_d_mcg": <number or null>,
  "vitamin_e_mg": <number or null>,
  "vitamin_b12_mcg": <number or null>
}

Estimate values for a typical serving size of what is shown. Use null for nutrients you cannot estimate. All values must be numbers (not strings).`;

export async function analyzeImage(photoPath: string): Promise<OllamaResult> {
  const ollamaUrl = getSetting("ollama_url") ?? "http://localhost:11434";
  const model = getSetting("ollama_model") ?? "llava";

  const DATA_DIR = process.env.DATA_DIR ?? "./data";
  const fullPath = join(DATA_DIR, "photos", photoPath);
  const imgBuffer = await readFile(fullPath);
  const base64 = imgBuffer.toString("base64");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        prompt: PROMPT,
        images: [base64],
        stream: false,
        format: "json",
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama returned ${res.status}: ${await res.text()}`);
    }

    const data = await res.json() as { response: string };
    const raw = data.response.trim();

    // Strip markdown code fences if present
    const jsonStr = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    const parsed = JSON.parse(jsonStr) as OllamaResult;

    // Coerce strings to numbers, fill missing keys with null
    const result: OllamaResult = {
      description: String(parsed.description ?? ""),
      calories_kcal: toNum(parsed.calories_kcal),
      water_g: toNum(parsed.water_g),
      salt_mg: toNum(parsed.salt_mg),
      sugar_g: toNum(parsed.sugar_g),
      fibre_g: toNum(parsed.fibre_g),
      caffeine_mg: toNum(parsed.caffeine_mg),
      calcium_mg: toNum(parsed.calcium_mg),
      iron_mg: toNum(parsed.iron_mg),
      magnesium_mg: toNum(parsed.magnesium_mg),
      potassium_mg: toNum(parsed.potassium_mg),
      zinc_mg: toNum(parsed.zinc_mg),
      vitamin_a_mcg: toNum(parsed.vitamin_a_mcg),
      vitamin_c_mg: toNum(parsed.vitamin_c_mg),
      vitamin_d_mcg: toNum(parsed.vitamin_d_mcg),
      vitamin_e_mg: toNum(parsed.vitamin_e_mg),
      vitamin_b12_mcg: toNum(parsed.vitamin_b12_mcg),
    };
    return result;
  } finally {
    clearTimeout(timer);
  }
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}
