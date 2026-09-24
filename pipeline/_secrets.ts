/** Birdəfəlik köməkçi: .env-dəki açarları GitHub Actions Secrets-ə yazır. */
import "dotenv/config";
import sodium from "libsodium-wrappers";

const REPO = process.argv[2];
const PAT = process.env.GH_PAT!;
if (!PAT) throw new Error("GH_PAT yoxdur");

const NAMES = [
  "OPENAI_API_KEY",
  "NVIDIA_API_KEY",
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  "CEREBRAS_API_KEY",
  "OPENROUTER_API_KEY",
  "GH_MODELS_TOKEN",
  "MISTRAL_API_KEY",
  "SAMBANOVA_API_KEY",
  "PEXELS_API_KEY",
  "META_ACCESS_TOKEN",
  "META_PAGE_ID",
  "META_IG_USER_ID",
  "AUDIUS_API_TOKEN",
] as const;

const gh = async (path: string, init: RequestInit = {}) =>
  fetch(`https://api.github.com/repos/${REPO}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${PAT}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

await sodium.ready;

const keyRes = await gh("actions/secrets/public-key");
const { key, key_id } = (await keyRes.json()) as { key: string; key_id: string };

// Əlavə adlar verilibsə yalnız onlar yazılır: npx tsx pipeline/_secrets.ts <repo> SMM_URL SMM_TOKEN
const only = process.argv.slice(3);
for (const name of (only.length ? only : NAMES) as readonly string[]) {
  const value = process.env[name];
  if (!value) {
    console.log(`✗ ${name.padEnd(20)} .env-də yoxdur`);
    continue;
  }
  const encrypted = sodium.to_base64(
    sodium.crypto_box_seal(sodium.from_string(value), sodium.from_base64(key, sodium.base64_variants.ORIGINAL)),
    sodium.base64_variants.ORIGINAL
  );
  const res = await gh(`actions/secrets/${name}`, {
    method: "PUT",
    body: JSON.stringify({ encrypted_value: encrypted, key_id }),
  });
  console.log(`${res.ok ? "✓" : "✗"} ${name.padEnd(20)} HTTP ${res.status}`);
}
