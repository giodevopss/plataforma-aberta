// SPDX-License-Identifier: MIT
// Track only children started by this managed app; no system process scan.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const childProcess = require("node:child_process");
const { identity } = require("./managed-process-identity.cjs");
let installed = false;
let directory = null;
let directoryGetter = null;
const originals = new Map();
const children = new Map();
function record(child) {
  if (!child || typeof child.once !== "function") return child;
  const entry = { child, file: null, exited: false };
  children.set(child, entry);
  const publish = () => {
    if (
      !directory ||
      entry.exited ||
      entry.file ||
      !Number.isInteger(child.pid)
    )
      return;
    const name =
      "child-" +
      child.pid +
      "-" +
      crypto.randomBytes(8).toString("hex") +
      ".pid";
    entry.file = path.join(directory, "sidecar-pids", name);
    fs.writeFileSync(
      entry.file,
      JSON.stringify({ version: 1, pid: child.pid, identity: null }) + "\n",
      { mode: 0o600, flag: "wx" },
    );
    identity(child.pid)
      .then((started) => {
        if (entry.exited || !started) return;
        const temporary = entry.file + ".tmp";
        fs.writeFileSync(
          temporary,
          JSON.stringify({ version: 1, pid: child.pid, identity: started }) +
            "\n",
          { mode: 0o600, flag: "wx" },
        );
        fs.renameSync(temporary, entry.file);
      })
      .catch((error) => {
        if (entry.exited) return;
        fs.rmSync(path.join(directory, "plataforma-process-registry.json"), {
          force: true,
        });
        console.error(
          "Managed native process identity could not be recorded:",
          error.message,
        );
      });
  };
  const remove = () => {
    entry.exited = true;
    children.delete(child);
    if (entry.file && fs.existsSync(entry.file)) fs.unlinkSync(entry.file);
  };
  entry.publish = publish;
  child.once("spawn", publish);
  child.once("exit", remove);
  child.once("close", remove);
  publish();
  return child;
}
function install(options = {}) {
  if (installed) return;
  directoryGetter =
    options.directory || (() => require("electron").app.getPath("userData"));
  for (const name of ["spawn", "execFile", "exec", "fork"]) {
    const original = childProcess[name];
    originals.set(name, original);
    childProcess[name] = function (...args) {
      const child = original.apply(this, args);
      return children.has(child) ? child : record(child);
    };
  }
  require("node:module").syncBuiltinESMExports();
  installed = true;
}
function ready() {
  if (!installed) return false;
  const root = directoryGetter();
  if (!path.isAbsolute(root) || /[\0\r\n]/.test(root))
    throw Error("Invalid managed process profile");
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  if (fs.lstatSync(root).isSymbolicLink())
    throw Error("Managed process profile cannot be a link");
  directory = fs.realpathSync(root);
  const pids = path.join(directory, "sidecar-pids");
  fs.mkdirSync(pids, { recursive: true, mode: 0o700 });
  if (fs.lstatSync(pids).isSymbolicLink())
    throw Error("Managed sidecar registry cannot be a link");
  const marker = path.join(directory, "plataforma-process-registry.json");
  if (fs.existsSync(marker) && fs.lstatSync(marker).isSymbolicLink())
    throw Error("Invalid native process capability marker");
  fs.writeFileSync(marker, JSON.stringify({ version: 1 }) + "\n", {
    mode: 0o600,
  });
  for (const entry of children.values()) entry.publish();
  return true;
}
function resetForTests() {
  for (const [name, original] of originals) childProcess[name] = original;
  originals.clear();
  require("node:module").syncBuiltinESMExports();
  installed = false;
  directory = null;
  directoryGetter = null;
}
function shutdown() {
  for (const { child } of children.values()) {
    if (
      child.exitCode === null &&
      !child.killed &&
      typeof child.kill === "function"
    )
      child.kill("SIGTERM");
  }
}
module.exports = { install, ready, shutdown, resetForTests };
