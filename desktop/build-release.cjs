const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const target = process.argv[2];
if (!new Set(["mac", "win"]).has(target)) {
  throw new Error("Usage: node desktop/build-release.cjs <mac|win>");
}

const root = path.resolve(__dirname, "..");
const output = path.join(root, "desktop-dist");
const temporaryOutput = fs.mkdtempSync(path.join(os.tmpdir(), `qiyu-ai-${target}-`));
const builderCli = path.join(
  root,
  "node_modules",
  "electron-builder",
  "out",
  "cli",
  "cli.js",
);

const args = target === "mac"
  ? ["--mac", "dmg", "zip", "--arm64", "--publish", "never"]
  : ["--win", "nsis", "zip", "--x64", "--publish", "never"];

try {
  // Invoke the JavaScript CLI through Node instead of the Windows .cmd shim.
  // execFileSync keeps each path as a separate argument, so a repository path
  // containing spaces or Chinese characters cannot be split by cmd.exe.
  execFileSync(process.execPath, [
    builderCli,
    ...args,
    `--config.directories.output=${temporaryOutput}`,
  ], {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });

  if (target === "mac") {
    const appPath = path.join(temporaryOutput, "mac-arm64", "奇遇AI.app");
    execFileSync("/usr/bin/codesign", [
      "--verify",
      "--deep",
      "--strict",
      "--verbose=2",
      appPath,
    ], { stdio: "inherit" });
  }

  fs.mkdirSync(output, { recursive: true });
  for (const name of fs.readdirSync(temporaryOutput)) {
    const extension = path.extname(name).toLowerCase();
    if (![".dmg", ".zip", ".exe", ".blockmap"].includes(extension)) continue;
    fs.copyFileSync(path.join(temporaryOutput, name), path.join(output, name));
  }
} finally {
  fs.rmSync(temporaryOutput, { recursive: true, force: true });
}
