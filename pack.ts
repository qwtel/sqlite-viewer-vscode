/// <reference types="bun-types" />

import { parseArgs } from "node:util";

const kinds = ["package", "publish"] as const

const targets = [
  "win32-x64",
  "win32-arm64",
  "linux-x64",
  "linux-arm64",
  "linux-armhf",
  "alpine-x64",
  "alpine-arm64",
  "darwin-x64",
  "darwin-arm64",
  // "web",
] as const;

export const packageExt = async (opts: {
  kind?: string,
  target?: string,
  'pre-release'?: boolean,
}, env = Bun.env) => {
  let { kind, target, 'pre-release': preRelease } = opts;

  if (kind && !kinds.includes(kind as any)) {
    throw new Error(`Invalid kind: ${kind}. Must be one of: ${kinds.join(', ')}`);
  }
  kind ||= "package";

  if (target && !targets.includes(target as any)) {
    throw new Error(`Invalid target: ${target}. Must be one of: ${targets.join(', ')}`);
  }

  if (!target) {
    console.warn("Assuming target: darwin-arm64");
    target = "darwin-arm64"; // FIXME: make host platform
  }

  const proc = Bun.spawn([
    "vsce", 
    kind,
    ...preRelease ? ["--pre-release"] : [], 
    "--target", target, 
    "--baseContentUrl", "https://raw.githubusercontent.com/qwtel/sqlite-viewer-vscode/master/"
  ], {
    env: { 
      ...env, 
      TJS_ZIG_OUT: "~/GitHub/txiki.js/zig-out", 
      VSCODE_EXT_TARGET: target,
    },
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`Failed with exit code ${exitCode}`);
  }
};

if (import.meta.main) {
  const args = parseArgs({
    args: Bun.argv,
    options: {
      kind: { type: 'string' },
      target: { type: 'string' },
      "pre-release": { type: 'boolean' },
    },
    strict: true,
    allowPositionals: true,
  });

  await packageExt(args.values).catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
