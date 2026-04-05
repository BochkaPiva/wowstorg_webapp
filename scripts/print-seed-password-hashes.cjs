/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Локально из корня репозитория (после npm install):
 *   node scripts/print-seed-password-hashes.cjs
 * Скопируй строки хешей в SQL вместо crypt(), если в Supabase нельзя включить pgcrypto.
 */
const { hashSync } = require("bcryptjs");

const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "admin12345";
const greenwichPassword = process.env.SEED_GREENWICH_PASSWORD ?? "greenwich12345";

console.log("admin passwordHash:");
console.log(hashSync(adminPassword, 10));
console.log("greenwich passwordHash:");
console.log(hashSync(greenwichPassword, 10));
