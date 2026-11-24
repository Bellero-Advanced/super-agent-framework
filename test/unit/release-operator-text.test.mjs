import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { cleanup, gitRepo, lib } from "../helpers.mjs";

/** SETUP-AC-14 (docs/specs/setup-choices.md rule 27): the release-operator file and CLAUDE.md follow policies.deploy / push. */
const { generate } = await lib("generate.mjs");
after(cleanup);

const render = (policies, lang = "en") => {
  const root = gitRepo();
  generate(root, { people: { docLanguage: lang }, stack: { packageManager: "none" }, roles: { enabled: ["release-operator"] }, policies });
  const read = (f) => readFileSync(join(root, f), "utf8").split(/\r?\n/);
  return { agent: read(".claude/agents/release-operator.md"), claude: read("CLAUDE.md") };
};
const description = (agent) => agent.find((l) => l.startsWith("description:"));
const steps = (agent) => agent.filter((l) => /^\d\. /.test(l)).join("\n");
const ORDER = /owner order|owner's order|\bNo order\b/i;

test("SETUP-AC-14 deploy: allowed - the description and the steps ask for no owner order and check the deploy target and exceptions", () => {
  const { agent } = render({ deploy: { mode: "allowed", target: "staging", exceptions: "production" } });
  assert.doesNotMatch(description(agent), ORDER);
  assert.doesNotMatch(steps(agent), ORDER);
  assert.match(steps(agent), /deploy policy/);
  assert.match(agent.join("\n"), /target: staging · exceptions: production/);
});

test("SETUP-AC-14 deploy: owner-order - the description and step 1 still ask for the owner's order", () => {
  const { agent } = render({ deploy: { mode: "owner-order", target: "", exceptions: "" } });
  assert.match(description(agent), /only on an explicit owner order/);
  assert.match(steps(agent), /Quote the owner's order/);
  assert.match(steps(agent), /No order → stop/);
});

test("SETUP-AC-14 push: allowed with autoDeployBranches - one sentence says allowed except to main, in the agent file and the CLAUDE.md git line", () => {
  const { agent, claude } = render({ push: "allowed", autoDeployBranches: ["main"] });
  const rule = agent.filter((l) => l.startsWith("- ") && /push/i.test(l));
  assert.equal(rule.length, 1, "one push rule line, no separate auto-deploy bullet");
  assert.match(rule[0], /Pushing is allowed, except to main — that push deploys automatically and counts as a release/);
  assert.doesNotMatch(agent.join("\n"), /treat that push as a release/);
  const git = claude.find((l) => l.startsWith("- **git:**"));
  assert.match(git, /push is allowed except to main \(deploys automatically\)/);
  assert.doesNotMatch(git, /· pushing main deploys automatically/);
});

test("SETUP-AC-14 push: allowed with protectedBranches - the push rule names main", () => {
  const { agent, claude } = render({ push: "allowed", protectedBranches: ["main"], autoDeployBranches: [] });
  const rule = agent.find((l) => l.startsWith("- ") && /push/i.test(l));
  assert.match(rule, /Pushing is allowed \(protected branches: main\); never force-push/);
  assert.doesNotMatch(rule, /except/);
  assert.match(claude.find((l) => l.startsWith("- **git:**")), /push is allowed · never force-push or rewrite history · protected branches: main/);
});

test("SETUP-AC-14 push: owner-order keeps its text, and the Thai CLAUDE.md git line says allowed except to main", () => {
  const { agent, claude } = render({ push: "owner-order", autoDeployBranches: ["main"] });
  const rule = agent.find((l) => l.startsWith("- ") && /push/i.test(l));
  assert.match(rule, /^- Never push without the owner's order \(pushing main deploys automatically and counts as a release\); never force-push/);
  assert.match(claude.find((l) => l.startsWith("- **git:**")), /push only when the owner orders it · never force-push.*· pushing main deploys automatically/);
  const th = render({ push: "allowed", autoDeployBranches: ["main"] }, "th").claude.find((l) => l.startsWith("- **git:**"));
  assert.match(th, /push ได้ ยกเว้น/);
  assert.doesNotMatch(th, /· push main = deploy อัตโนมัติ/);
});
