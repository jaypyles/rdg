import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const huskyBin = "node_modules/.bin/husky";

if (!existsSync(huskyBin)) {
  process.exit(0);
}

const result = spawnSync(huskyBin, [], { stdio: "inherit" });

process.exit(result.status ?? 1);
