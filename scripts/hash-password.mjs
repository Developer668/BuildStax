import { randomBytes, scryptSync } from "node:crypto";

const password = process.env.BUILDSTAX_ADMIN_PASSWORD;

if (!password || password.length < 12) {
  console.error("Set BUILDSTAX_ADMIN_PASSWORD to at least 12 characters before running this command.");
  process.exit(1);
}

const salt = randomBytes(16).toString("hex");
const hash = scryptSync(password, salt, 64).toString("hex");

process.stdout.write(`scrypt$${salt}$${hash}\n`);
