import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const vitePackageJsonPath = require.resolve("vite/package.json");
const viteCli = path.join(path.dirname(vitePackageJsonPath), "bin", "vite.js");

const child = spawn(process.execPath, [viteCli], {
  stdio: "inherit",
});

let stopping = false;

function shutdown(signal) {
  if (stopping) {
    return;
  }
  stopping = true;

  console.log("[web] shutting down...");

  if (process.platform === "win32") {
    child.kill();
  } else {
    child.kill(signal);
  }
}

process.on("SIGINT", () => {
  shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});

child.on("exit", (code, signal) => {
  if (stopping) {
    process.exit(0);
    return;
  }

  if (signal === "SIGINT" || signal === "SIGTERM") {
    process.exit(0);
    return;
  }

  process.exit(code ?? 0);
});
