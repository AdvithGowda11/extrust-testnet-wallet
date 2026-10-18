// Reproduce a serverless relocation: only traced package files are available.
// This catches a missing Bitcoin WASM binary before publishing a build.
import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

const root = process.cwd();
const traceFile = path.join(root, ".next/server/app/page.js.nft.json");
const trace = JSON.parse(await readFile(traceFile, "utf8"));
const files = trace.files.map((file) =>
  path.resolve(path.dirname(traceFile), file),
);
const packageRoot = path.join(root, "node_modules/tiny-secp256k1");
const packageFiles = files.filter((file) =>
  file.startsWith(packageRoot + path.sep),
);
assert(
  packageFiles.includes(path.join(packageRoot, "lib/secp256k1.wasm")),
  "Bitcoin WASM is missing from the server trace",
);
const relocated = await mkdtemp(path.join(tmpdir(), "extrust-traced-wasm-"));
try {
  for (const source of packageFiles) {
    const destination = path.join(relocated, path.relative(root, source));
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }
  const require = createRequire(path.join(relocated, "check.cjs"));
  const ecc = require("tiny-secp256k1");
  const scalar = new Uint8Array(32);
  scalar[31] = 1;
  assert.equal(
    Buffer.from(ecc.pointFromScalar(scalar)).toString("hex"),
    "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
  );
  console.log(
    "Traced Bitcoin WASM loads and computes correctly after relocation.",
  );
} finally {
  await rm(relocated, { recursive: true, force: true });
}
