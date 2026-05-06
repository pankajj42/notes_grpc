import { spawn } from "node:child_process";

const pnpmCommand = "pnpm";

let activeChild;

let stopping = false;

function shutdown(signal) {
  if (stopping) {
    return;
  }
  stopping = true;
  console.log("[workspace] shutting down services...");
  if (activeChild != null) {
    activeChild.kill(signal);
  }
}

process.on("SIGINT", () => {
  shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(`${command} ${args.join(" ")}`, {
      stdio: "inherit",
      shell: true,
    });

    activeChild = child;

    child.on("exit", (code, signal) => {
      if (stopping || signal === "SIGINT" || signal === "SIGTERM") {
        resolve(0);
        return;
      }

      resolve(code ?? 0);
    });
  });
}

async function main() {
  const prepareCode = await run(pnpmCommand, ["run", "dev:prepare"]);
  if (stopping) {
    process.exit(0);
    return;
  }
  if (prepareCode !== 0) {
    process.exit(prepareCode);
    return;
  }

  const devCode = await run(pnpmCommand, ["-r", "--parallel", "--no-bail", "run", "dev"]);
  if (stopping) {
    process.exit(0);
    return;
  }

  process.exit(devCode);
}

void main();
