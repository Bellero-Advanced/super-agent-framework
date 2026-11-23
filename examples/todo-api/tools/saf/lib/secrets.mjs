import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { globToRegExp } from "./glob.mjs";

/**
 * check-secrets — no secret values in tracked or new (non-ignored) files.
 * Matches value shapes, not variable names. Reports file:line and the kind only — never the value.
 * Also fails when an env file (policies.secrets.envFiles) is tracked, except *.example / *.sample / *.template.
 */

export const SECRET_PATTERNS = [
  ["Anthropic key", /sk-ant-[A-Za-z0-9_-]{20,}/],
  ["OpenAI key", /sk-(?:proj-)?[A-Za-z0-9_-]{32,}/],
  ["Stripe key", /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}/],
  ["GitHub token", /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{50,}/],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["npm token", /\bnpm_[A-Za-z0-9]{36}\b/],
  ["Cloudflare token", /\bcfut_[A-Za-z0-9]{40,}/],
  ["private key", /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/],
  ["Discord webhook", /https?:\/\/(?:[\w-]+\.)*discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]{20,}/],
  ["Slack webhook", /https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[A-Za-z0-9]{20,}/],
  ["Claude Code env value", /"ANTHROPIC_(?:AUTH_TOKEN|API_KEY|BASE_URL)"\s*:\s*"[^"]+"/],
  ["database URL with password", /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|rediss?):\/\/[^\s:/@'"]+:[^\s@'"]{3,}@[^\s'"]+/],
];

const BINARY = /\.(png|jpe?g|webp|gif|ico|pdf|mp3|mp4|ogg|opus|wav|woff2?|ttf|otf|zip|gz|tgz|jar|wasm|lockb)$/i;
const SKIP = /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lock)$/;
const EXAMPLE = /\.(example|sample|template|dist)$/;
const MAX_BYTES = 2 * 1024 * 1024;

/** @returns {{findings:{file:string,line?:number,kind:string}[], scanned:number}} */
export function scanSecrets(root, files, config) {
  const patterns = [...SECRET_PATTERNS, ...(config?.policies?.secrets?.extraPatterns ?? []).map((p, i) => [`custom pattern ${i + 1}`, new RegExp(p)])];
  const envGlobs = (config?.policies?.secrets?.envFiles ?? []).map((g) => globToRegExp(g.includes("/") ? g : `**/${g}`));
  const findings = [];
  let scanned = 0;
  for (const f of files) {
    const name = f.split("/").pop() ?? f;
    if (!EXAMPLE.test(name) && envGlobs.some((re) => re.test(f))) findings.push({ file: f, kind: "env file is tracked or not ignored (add it to .gitignore)" });
    if (BINARY.test(f) || SKIP.test(f)) continue;
    let text;
    try {
      if (statSync(join(root, f)).size > MAX_BYTES) continue;
      text = readFileSync(join(root, f), "utf8");
    } catch {
      continue;
    }
    scanned++;
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const [kind, re] of patterns) if (re.test(line)) findings.push({ file: f, line: i + 1, kind });
    });
  }
  return { findings, scanned };
}
