import { spawn } from "node:child_process";

export type FlySpawnResult = {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly spawnError: boolean;
};

export type FlySpawnFn = (input: {
  readonly args: readonly string[];
}) => Promise<FlySpawnResult>;

export function runFlySpawnDefault(input: {
  readonly args: readonly string[];
}): Promise<FlySpawnResult> {
  return new Promise((resolve) => {
    try {
      const child = spawn("fly", [...input.args], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      let out = "";
      let err = "";
      child.stdout?.on("data", (chunk: Buffer) => {
        out += chunk.toString("utf8");
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        err += chunk.toString("utf8");
      });
      child.on("error", () => resolve({ exitCode: null, stdout: "", spawnError: true }));
      child.on("close", (code) => {
        resolve({
          exitCode: code,
          stdout: out.length > 0 ? out : err,
          spawnError: false,
        });
      });
    } catch {
      resolve({ exitCode: null, stdout: "", spawnError: true });
    }
  });
}
