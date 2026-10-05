import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const previewOrigin = "https://test.carnetpass.fr";
const productionOrigin = "https://www.carnetpass.fr";
const expectedPreviewProject = "bqqzzbwqmiyxcotvqtoc";
const execFileAsync = promisify(execFile);

export function supabaseProjectRefs(source) {
  return [...new Set([...source.matchAll(/https:\/\/([a-z0-9]+)\.supabase\.co/gi)]
    .map((match) => match[1].toLowerCase()))];
}

export function configuredSupabaseProjectRefs(source) {
  return [...new Set([...source.matchAll(/\bVITE_SUPABASE_URL\s*:\s*["'`](https:\/\/([a-z0-9]{20})\.supabase\.co)["'`]/gi)]
    .map((match) => match[2].toLowerCase()))];
}

export function mainScriptPath(html) {
  const match = html.match(/<script\b[^>]*\bsrc=["']([^"']+\.js)["'][^>]*>/i);
  if (!match || !match[1].startsWith("/assets/")) throw new Error("Bundle principal introuvable.");
  return match[1];
}

async function get(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000), redirect: "follow" });
    return { status: response.status, body: await response.text() };
  } catch {
    // Some Windows setups route HTTPS through curl but not through Node's fetch.
    const command = process.platform === "win32" ? "curl.exe" : "curl";
    const { stdout } = await execFileAsync(command, ["-sS", "-L", "-m", "20", "-w", "\n%{http_code}", url],
      { timeout: 25000, maxBuffer: 4 * 1024 * 1024 });
    const marker = stdout.lastIndexOf("\n");
    const status = Number(stdout.slice(marker + 1));
    if (marker < 0 || !Number.isInteger(status)) throw new Error(`Réponse HTTP illisible : ${url}`);
    return { status, body: stdout.slice(0, marker) };
  }
}

async function inspect(origin) {
  const [admin, adminPage, page] = await Promise.all([
    get(`${origin}/api/platform-admin`),
    get(`${origin}/administration-interne`),
    get(`${origin}/`),
  ]);
  if (page.status !== 200) throw new Error(`${origin} : accueil HTTP ${page.status}.`);
  const script = await get(new URL(mainScriptPath(page.body), origin));
  if (script.status !== 200) throw new Error(`${origin} : bundle HTTP ${script.status}.`);
  return { adminStatus: admin.status, adminPageStatus: adminPage.status,
    projectRefs: configuredSupabaseProjectRefs(script.body) };
}

export async function auditEnvironments({ requireProduction = false } = {}) {
  const [preview, production] = await Promise.all([
    inspect(previewOrigin), inspect(productionOrigin),
  ]);
  const checks = [
    ["Lien d'administration Preview disponible (200)", preview.adminPageStatus === 200],
    ["API admin Preview protégée (401 sans session)", preview.adminStatus === 401],
    ["API admin Production fermée (404)", production.adminStatus === 404],
    ["Base publique Preview attendue", preview.projectRefs.length === 1
      && preview.projectRefs[0] === expectedPreviewProject],
  ];
  for (const [label, passed] of checks) {
    console.log(`${passed ? "OK" : "À VÉRIFIER"} — ${label}`);
  }
  const productionReady = production.projectRefs.length === 1
    && production.projectRefs[0] !== expectedPreviewProject;
  console.log(`${productionReady ? "OK" : "EN ATTENTE"} — Base Supabase Production distincte dans l'application publiée.`);
  if (!productionReady && production.projectRefs.length === 0) {
    console.log("La branche main actuelle ne contient pas encore Supabase : cette absence ne prouve pas une variable Vercel manquante.");
  }
  console.log(`Références publiques : Preview ${preview.projectRefs.join(", ") || "absente"} ; Production ${production.projectRefs.join(", ") || "absente"}.`);
  console.log("Ce contrôle public ne vérifie ni les clés serveur, ni les rôles admin, ni les migrations Supabase.");
  return checks.every(([, passed]) => passed) && (!requireProduction || productionReady);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  auditEnvironments({ requireProduction: process.argv.includes("--require-production") })
    .then((passed) => { if (!passed) process.exitCode = 1; })
    .catch((error) => { console.error(`Audit indisponible : ${error.message}`); process.exitCode = 2; });
}
