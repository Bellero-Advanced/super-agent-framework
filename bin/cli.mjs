#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { init, kitVersion, upgrade } from "../src/install.mjs";

const HELP = `SAF — Super Agent Framework

usage:
  super-agent-framework init [--dir <path>] [--answers <file.json>] [--adopt | --no-adopt]
  super-agent-framework upgrade [--dir <path>]
  super-agent-framework version

init      copy the SAF engine (tools/saf/) and the /saf-setup skill into the project, then
          open \`claude\` and type /saf-setup — or pass --answers to set up without the interview
upgrade   replace the vendored engine and the setup skill; project content is not touched
`;

const argv = process.argv.slice(2).filter((a) => a !== "--");
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const log = (s) => process.stdout.write(`${s}\n`);

async function main() {
  const cmd = argv[0];
  const root = resolve(flag("--dir") ?? process.cwd());
  switch (cmd) {
    case "init": {
      const file = flag("--answers");
      const answers = file ? JSON.parse(readFileSync(resolve(file), "utf8")) : undefined;
      const adopt = argv.includes("--adopt") ? true : argv.includes("--no-adopt") ? false : undefined;
      await init(root, { answers, adopt, log });
      return 0;
    }
    case "upgrade": {
      const r = await upgrade(root, { log });
      return r.errors.length ? 1 : 0;
    }
    case "version":
    case "--version":
    case "-v":
      log(kitVersion());
      return 0;
    case undefined:
    case "help":
    case "--help":
    case "-h":
      log(HELP);
      return cmd === undefined ? 2 : 0;
    default:
      process.stderr.write(`unknown command: ${cmd}\n\n${HELP}`);
      return 2;
  }
}

main().then(
  (code) => process.exit(code),
  (e) => {
    process.stderr.write(`✗ ${e instanceof Error ? e.message : e}\n`);
    process.exit(1);
  },
);
