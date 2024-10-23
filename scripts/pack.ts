/// <reference types="bun-types" />

import { parseArgs } from "node:util";
import URL from 'node:url';
import path from 'node:path'

const __filename = URL.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resolve = (...args: string[]) => path.resolve(__dirname, '..', ...args);

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

export const packageExt = async (opts: {
  tool?: string,
  kind?: string,
  target?: string,
  'pre-release'?: boolean,
}, env = Bun.env) => {
  let { tool, kind, target, 'pre-release': preRelease } = opts;

  tool ||= "vsce";
  if (!tools.includes(tool as any)) {
    throw new Error(`Invalid tool: ${tool}. Must be one of: ${tools.join(', ')}`);
  }

  if (kind && !kinds.includes(kind as any)) {
    throw new Error(`Invalid kind: ${kind}. Must be one of: ${kinds.join(', ')}`);
  }
  kind ||= "package";

  if (target && !targets.includes(target as any)) {
    throw new Error(`Invalid target: ${target}. Must be one of: ${targets.join(', ')}`);
  }

  if (!target) {
    console.warn(`Running '${kind}' without target`);
  }

  const cmd = [
    tool, 
    kind,
    ...preRelease ? ["--pre-release"] : [], 
    ...target ? ["--target", target] : [], 
    ...tool === "vsce" ? ["--baseContentUrl", "https://raw.githubusercontent.com/qwtel/sqlite-viewer-vscode/master/"] : []
  ];
  console.log(`Spawning '${cmd.join(" ")}':`);
  const proc = Bun.spawn(cmd, {
    env: { 
      ...env, 
      TJS_ZIG_OUT: resolve("zig-build-txiki/zig-out"), 
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
      tool: { type: 'string' },
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
