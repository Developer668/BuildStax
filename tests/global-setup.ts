import fs from "node:fs";
import path from "node:path";

export default function globalSetup() {
  for (const suffix of ["", "-shm", "-wal"]) {
    fs.rmSync(path.join(process.cwd(), `data/buildstax-e2e.db${suffix}`), { force: true });
  }
}
