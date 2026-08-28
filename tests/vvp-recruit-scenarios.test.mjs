import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const expectedCodes = [
  "RECRUIT-AUTH-INVALID-CREDENTIALS",
  "RECRUIT-AUTH-LOGIN",
  "RECRUIT-AUTH-LOGIN-FORM",
  "RECRUIT-AUTH-LOGOUT",
  "RECRUIT-AUTH-PROTECTED-ROUTE",
  "RECRUIT-CANDIDATES-CONSOLE-CLEAN",
  "RECRUIT-CAREER-SCORE-PERSISTENCE",
  "RECRUIT-FEEDBACK-NOT-FOUND",
  "RECRUIT-FEEDBACK-PUBLIC-ACCESS",
  "RECRUIT-FEEDBACK-SUBMIT",
  "RECRUIT-FEEDBACK-UPSERT",
];

test("VVP Recruit tests expose every Test Tower scenario code exactly once", async () => {
  const suiteUrl = new URL("../projects/VVP-Recruit/", import.meta.url);
  const sources = await Promise.all([
    "interview-feedback.spec.ts",
    "login.spec.ts",
    "scoring.spec.ts",
  ].map((name) => readFile(fileURLToPath(new URL(name, suiteUrl)), "utf8")));

  const actualCodes = sources
    .flatMap((source) => [...source.matchAll(/@scenario:([A-Z0-9-]+)/g)].map((match) => match[1]))
    .sort();

  assert.deepEqual(actualCodes, expectedCodes);
});
