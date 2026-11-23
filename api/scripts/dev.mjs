import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempDisposableSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const withWeb = process.argv[2] === "--with-web";
const inheritedDirectory = process.env.SPRINTERS_DEV_DATA_DIRECTORY;
const data = withWeb || !inheritedDirectory
  ? mkdtempDisposableSync(join(tmpdir(), "sprinters-dev-"))
  : undefined;
const env = { ...process.env, SPRINTERS_DEV_DATA_DIRECTORY: data?.path ?? inheritedDirectory };

try {
  if (withWeb) {
    const { default: concurrently } = await import("concurrently");
    const { result } = concurrently([
      { name: "API", command: "npm run dev --workspace @sprinters/api", env },
      { name: "WEB", command: "npm run dev --workspace @sprinters/web" },
    ], { killOthersOn: ["success", "failure"] });
    await result.catch(() => { process.exitCode = 1; });
  } else {
    await watchApi();
  }
} finally {
  data?.remove();
}

async function watchApi() {
  const watcher = spawn(process.execPath, [
    fileURLToPath(import.meta.resolve("tsx/cli")), "watch", "src/server.ts",
  ], { stdio: "inherit", env });

  function interrupt() {
    // On Windows, Ctrl+C already reaches the watcher through the shared console.
    if (process.platform !== "win32") watcher.kill("SIGINT");
  }
  const terminate = () => watcher.kill("SIGTERM");
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  try {
    const [code, signal] = await once(watcher, "close");
    process.exitCode = code ?? (signal === "SIGINT" || signal === "SIGTERM" ? 0 : 1);
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  }
}
