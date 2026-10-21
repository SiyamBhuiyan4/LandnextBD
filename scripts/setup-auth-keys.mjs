// Generates Convex Auth JWT keys and sets them on the current Convex deployment.
// Usage: node scripts/setup-auth-keys.mjs [--prod]
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";
import { execFileSync } from "node:child_process";

const prod = process.argv.includes("--prod");
const keys = await generateKeyPair("RS256", { extractable: true });
const privateKey = (await exportPKCS8(keys.privateKey)).trimEnd().replace(/\n/g, " ");
const jwks = JSON.stringify({ keys: [{ use: "sig", ...(await exportJWK(keys.publicKey)) }] });

for (const [name, value] of [["JWT_PRIVATE_KEY", privateKey], ["JWKS", jwks]]) {
  execFileSync("npx", ["convex", "env", "set", ...(prod ? ["--prod"] : []), name, "--", value], { stdio: ["ignore", "ignore", "inherit"] });
  console.log(`set ${name}`);
}
