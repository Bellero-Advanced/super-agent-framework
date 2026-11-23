import { spawn, spawnSync } from "node:child_process";

/**
 * Runs one shell line, keeps exit code · duration · output tail (for card criteria, gates, merge checks).
 * Output is passed through `redactSecrets` before it is stored or printed.
 */

export const RUN_LIMITS = { tailPass: 20, tailFail: 60, failuresKept: 3, killGraceMs: 5000, keepBytes: 64 * 1024 };

const SECRET_ENV_NAME = /TOKEN|SECRET|PASSWORD|PASSWD|KEY|WEBHOOK|CREDENTIAL|^DATABASE_URL|_DSN$/i;
const MIN_SECRET = 8;

const PATTERNS = [
  [/\b(?:postgres(?:ql)?|rediss?|mysql|mariadb|mongodb(?:\+srv)?|amqps?):\/\/\S+/gi, "<db-url>"],
  [/https?:\/\/(?:[\w-]+\.)*discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/\S+/gi, "<webhook>"],
  [/https:\/\/hooks\.slack\.com\/\S+/gi, "<webhook>"],
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/?#@]*:[^\s/?#@]*@/gi, "$1<userinfo>@"],
  [/\b(Bearer\s+)[^\s'"<>]+/gi, "$1<token>"],
  [/\b(authorization\s*[:=]\s*)\S.*$/gim, "$1<authorization>"],
  [/([?&](?:key|token|access_token|api_key|apikey|secret|password)=)[^&\s#]+/gi, "$1<redacted>"],
  [/(?<![\w-])([\w-]*(?:TOKEN|SECRET|PASSWORD|API_KEY|APIKEY)[\w-]*\s*[=:]\s*)(?!<)("[^"]*"|'[^']*'|\S+)/gi, "$1<redacted>"],
];

/** Remove secret values: values of secret-looking env vars first (longest first), then shape patterns. */
export function redactSecrets(text, env = process.env) {
  let out = text;
  const values = [];
  for (const [name, value] of Object.entries(env)) {
    if (!value || !SECRET_ENV_NAME.test(name)) continue;
    for (const v of [value, ...(value.includes("\n") ? value.split(/\r?\n/).map((l) => l.trim()) : [])]) if (v.length >= MIN_SECRET) values.push([name, v]);
  }
  values.sort((a, b) => b[1].length - a[1].length);
  for (const [name, v] of values) out = out.split(v).join(`<$${name}>`);
  for (const [re, to] of PATTERNS) out = out.replace(re, to);
  return out;
}

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[A-Za-z]|\u001b\][^\u0007]*\u0007/g;

export function tailOf(text, lines) {
  return text
    .replace(ANSI, "")
    .replace(/\r(?!\n)/g, "\n")
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== "")
    .slice(-lines);
}

export const IS_WINDOWS = process.platform === "win32";

let bashPath;
/** POSIX: bash when present (card commands are usually written for it), else the default shell. Windows: cmd.exe. */
function shell() {
  if (IS_WINDOWS) return null;
  if (bashPath === undefined) {
    const r = spawnSync("bash", ["-c", "exit 0"], { stdio: "ignore" });
    bashPath = r.status === 0 ? "bash" : null;
  }
  return bashPath;
}

/** Stop a command and everything it started: the process group on POSIX, the process tree on Windows. */
export function killTree(child, signal) {
  if (!child.pid) return;
  try {
    if (IS_WINDOWS) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    else process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // already gone
    }
  }
}

/** Quote one argument for cmd.exe (used when a .cmd shim such as npm or claude must run through the shell on Windows). */
export const quoteWindowsArg = (a) => (/^[\w@%+=:,./\\-]+$/.test(a) ? a : `"${a.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, "$1$1")}"`);

/**
 * @param {string} root working directory
 * @param {{onOutput?:(s:string)=>void, timeoutMs?:number, env?:object}} opts
 * @returns {(cmd:string, o?:{signal?:AbortSignal})=>Promise<{cmd:string,exit:number,ms:number,tail:string[]}>}
 */
export function taskRunner(root, opts = {}) {
  return (cmd, o = {}) =>
    new Promise((resolve) => {
      const started = Date.now();
      const env = { ...process.env, ...(opts.env ?? {}) };
      const sh = shell();
      const child = sh
        ? spawn(sh, ["-c", cmd], { cwd: root, env, detached: true, stdio: ["ignore", "pipe", "pipe"] })
        : spawn(cmd, { cwd: root, env, shell: true, detached: !IS_WINDOWS, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      let buf = "";
      const onData = (d) => {
        const s = d.toString();
        opts.onOutput?.(redactSecrets(s, env));
        buf += s;
        if (buf.length > RUN_LIMITS.keepBytes * 2) buf = buf.slice(-RUN_LIMITS.keepBytes);
      };
      child.stdout.on("data", onData);
      child.stderr.on("data", onData);
      let killedFor = null;
      const kill = (why) => {
        if (killedFor) return;
        killedFor = why;
        killTree(child, "SIGTERM");
        if (!IS_WINDOWS) setTimeout(() => killTree(child, "SIGKILL"), RUN_LIMITS.killGraceMs).unref();
      };
      const timer = setTimeout(() => kill("timeout"), opts.timeoutMs ?? 30 * 60 * 1000);
      timer.unref();
      o.signal?.addEventListener("abort", () => kill("aborted"), { once: true });
      const finish = (code) => {
        clearTimeout(timer);
        const exit = killedFor === "timeout" ? 124 : killedFor === "aborted" ? 130 : code ?? 1;
        const tail = tailOf(redactSecrets(buf.slice(-RUN_LIMITS.keepBytes), env), exit === 0 ? RUN_LIMITS.tailPass : RUN_LIMITS.tailFail);
        if (killedFor === "timeout") tail.push(`<stopped: exceeded ${(opts.timeoutMs ?? 0) / 1000}s>`);
        resolve({ cmd, exit, ms: Date.now() - started, tail });
      };
      child.on("error", (e) => {
        buf += `\n${e.message}`;
        finish(127);
      });
      child.on("close", (code) => finish(code));
    });
}
