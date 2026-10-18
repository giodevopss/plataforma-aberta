// SPDX-License-Identifier: MIT
// Query only a recorded child PID. Never enumerate processes or command lines.
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
let boot;
const execute = (binary, args) =>
  new Promise((resolve, reject) =>
    execFile(
      binary,
      args,
      {
        windowsHide: true,
        timeout: 15000,
        maxBuffer: 100000,
        env: { ...process.env, LANG: "C", LC_ALL: "C" },
      },
      (error, stdout) =>
        error ? reject(error) : resolve(stdout.replace(/^\uFEFF/, "").trim()),
    ),
  );
function exists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
}
function powershell(script) {
  const root = process.env.SystemRoot;
  if (!root || !path.win32.isAbsolute(root))
    throw Error("Windows system directory unavailable");
  return execute(
    path.join(root, "System32/WindowsPowerShell/v1.0/powershell.exe"),
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new();" + script,
    ],
  );
}
async function bootIdentity() {
  if (!boot)
    boot = (async () => {
      if (process.platform === "linux")
        return (
          await fs.readFile("/proc/sys/kernel/random/boot_id", "utf8")
        ).trim();
      if (process.platform === "darwin")
        return execute("/usr/sbin/sysctl", ["-n", "kern.bootsessionuuid"]);
      if (process.platform === "win32")
        return powershell(
          "(Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime().Ticks",
        );
      throw Error("Unsupported native process platform");
    })().catch((error) => {
      boot = null;
      throw error;
    });
  return boot;
}
async function identity(pid) {
  if (!Number.isInteger(pid) || pid < 1)
    throw Error("Invalid recorded process PID");
  const currentBoot = await bootIdentity();
  try {
    let started;
    if (process.platform === "linux") {
      const stat = await fs.readFile("/proc/" + pid + "/stat", "utf8");
      started = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
    } else if (process.platform === "darwin")
      started = await execute("/bin/ps", ["-p", String(pid), "-o", "lstart="]);
    else
      started = await powershell(
        "[System.Diagnostics.Process]::GetProcessById(" +
          pid +
          ").StartTime.ToUniversalTime().Ticks",
      );
    if (!started) {
      if (!exists(pid)) return null;
      throw Error("Native process start identity unavailable");
    }
    return JSON.stringify([currentBoot, started]);
  } catch (error) {
    if (!exists(pid)) return null;
    throw error;
  }
}
async function sameProcess(pid, expected) {
  if (typeof expected !== "string")
    throw Error("Native process identity is missing");
  const token = JSON.parse(expected);
  if (
    !Array.isArray(token) ||
    token.length !== 2 ||
    token.some((item) => typeof item !== "string" || !item)
  )
    throw Error("Invalid native process identity");
  if (token[0] !== (await bootIdentity())) return false;
  return (await identity(pid)) === expected;
}
module.exports = { identity, sameProcess };
