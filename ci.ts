/// <reference types="bun-types" />

import { packageExt } from "./pack";

const DEV = !!Bun.env.DEV;
console.log({ DEV })

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

for (const [i, target] of matrix.entries()) {
  await packageExt(
    { target, kind: "publish" }, 
    i === 0 ? Bun.env : { ...Bun.env, VSCODE_EXT_SKIP_COMPILE: "1" },
  );
}
