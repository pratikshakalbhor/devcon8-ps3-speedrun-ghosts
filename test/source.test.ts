import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

/** Strip Solidity line and block comments so prose like "no owner" is ignored. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const raw = readFileSync(resolve(root, "src/SpeedrunGhosts.sol"), "utf8");
const code = stripComments(raw);

describe("SpeedrunGhosts has no privileged surface", () => {
  const forbidden = [
    "selfdestruct",
    "delegatecall",
    "onlyOwner",
    "owner",
    "admin",
    "upgrade",
    "initializer",
    "receive(",
    "fallback(",
  ];

  for (const token of forbidden) {
    it(`does not contain "${token}"`, () => {
      expect(code.toLowerCase()).not.toContain(token.toLowerCase());
    });
  }

  it("exposes submitRun taking only input bytes (no time argument)", () => {
    const m = code.match(/function\s+submitRun\s*\(([^)]*)\)/);
    expect(m, "submitRun must exist").not.toBeNull();
    expect(m![1].replace(/\s+/g, " ").trim()).toBe("bytes calldata inputs");
  });

  it("has no function parameter named or typed as a time value", () => {
    const signatures = [...code.matchAll(/function\s+\w+\s*\(([^)]*)\)/g)].map((m) => m[1]);
    for (const params of signatures) {
      expect(params).not.toMatch(/time/i);
    }
  });
});
