/// <reference types="bun-types" />

import { parseArgs } from "node:util";
import { packageExt } from "./pack";

const DEV = !!Bun.env.DEV;
console.log({ DEV })

const kinds = ["package", "publish"] as const

const matrix = [
  "win32-x64",
  "win32-arm64",
  "linux-x64",
  "linux-arm64",
  "linux-armhf",
  "alpine-x64",
  "alpine-arm64",
  "darwin-x64",
  "darwin-arm64",
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

  if (kind && !kinds.includes(kind as any)) {
    throw new Error(`Invalid kind: ${kind}. Must be one of: ${kinds.join(', ')}`);
  }
  kind ||= "package";

  for (const [i, target] of matrix.entries()) {
    const env = i === 0 ? Bun.env : { ...Bun.env, VSCODE_EXT_SKIP_COMPILE: "1" }
    await packageExt({ tool, kind, target, 'pre-release': preRelease }, env);
  }
}
