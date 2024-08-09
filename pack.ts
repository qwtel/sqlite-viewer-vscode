/// <reference types="bun-types" />

import { $ } from "bun";
import { parseArgs } from "node:util";

const args = parseArgs({
  args: Bun.argv,
  options: {
    target: { type: 'string' },
  },
  strict: false,
  allowPositionals: true,
});

const targets = [
  "win32-x64",
  "win32-arm64",
  "linux-x64",
  "linux-arm64",
  // "linux-armhf",
  "alpine-x64",
  "alpine-arm64",
  "darwin-x64",
  "darwin-arm64",
  // "web",
] as const;

export const packageExt = async (target: typeof targets[number]) => {
  if (target && !(targets.includes(target))) {
    throw new Error(`Invalid target: ${target}. Must be one of: ${targets.join(', ')}`);
  }

  if (!target) {
    console.warn("Assuming target: darwin-arm64");
    target = "darwin-arm64"; // FIXME: make host platform
  }

  await $`TJS_ZIG_OUT=~/Downloads/zig-out VSCODE_EXT_TARGET=${target} vsce package --target=${target} --baseContentUrl=https://raw.githubusercontent.com/qwtel/sqlite-viewer-vscode/master/`
};

if (import.meta.main) {
  await packageExt(args.values.target as any).catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
