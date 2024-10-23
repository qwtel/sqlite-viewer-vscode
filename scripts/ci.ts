/// <reference types="bun-types" />

import { parseArgs } from "node:util";
import { packageExt } from "./pack";

const DEV = !!Bun.env.DEV;
console.log({ DEV })

const tools = ["vsce", "ovsx"] as const;
const kinds = ["package", "publish"] as const

const targets = [
  "darwin-arm64",
  "darwin-x64",
  "win32-arm64",
  "win32-x64",
  "linux-arm64",
  "linux-armhf",
  "linux-x64",
  "alpine-arm64",
  "alpine-x64",
  "web",
] as const;

if (import.meta.main) {
  const args = parseArgs({
    args: Bun.argv,
    options: {
      tool: { type: 'string' },
      kind: { type: 'string' },
      "pre-release": { type: 'boolean' },
    },
    strict: true,
    allowPositionals: true,
  });

  let { tool, kind, 'pre-release': preRelease } = args.values;

  tool ||= "vsce";
  if (!tools.includes(tool as any)) {
    throw new Error(`Invalid tool: ${tool}. Must be one of: ${tools.join(', ')}`);
  }

  if (kind && !kinds.includes(kind as any)) {
    throw new Error(`Invalid kind: ${kind}. Must be one of: ${kinds.join(', ')}`);
  }
  kind ||= "package";

  for (const [i, target] of targets.entries()) {
    const env = i === 0 
      ? { ...Bun.env, VSCODE_EXT_TOOL: tool, VSCODE_EXT_TARGET: target, } 
      : { ...Bun.env, VSCODE_EXT_TOOL: tool, VSCODE_EXT_TARGET: target, VSCODE_EXT_SKIP_BUILD: "1" }
    await packageExt({ tool, kind, target, 'pre-release': preRelease }, env);
  }
}
