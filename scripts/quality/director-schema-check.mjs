// Optional real PostgreSQL/WASM schema check; never connects to a remote DB.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
const require = createRequire(import.meta.url);
const { PGlite } = require(process.argv[2] ?? "@electric-sql/pglite");
const db = new PGlite();
try {
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
  const folders = (await readdir("prisma/migrations", { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  for (const folder of folders) {
    try { await db.exec(await readFile(path.join("prisma/migrations", folder, "migration.sql"), "utf8")); }
    catch (cause) { throw new Error(`Migration failed: ${folder}`, { cause }); }
  }
  const security = await db.query(`SELECT c.relname, c.relrowsecurity, has_table_privilege('anon', c.oid, 'SELECT') AS anon_read, has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_read FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('TelegramDirectorSettings','TelegramDirectorInbox') ORDER BY c.relname`);
  assert.equal(security.rows.length, 2);
  for (const row of security.rows) { assert.equal(row.relrowsecurity, true); assert.equal(row.anon_read, false); assert.equal(row.auth_read, false); }
  assert.equal((await db.query(`SELECT "revision" FROM "TelegramDirectorSettings" WHERE id='primary'`)).rows[0].revision, 0);
  await db.exec(`INSERT INTO "User" (id,login,"passwordHash",role,"displayName","updatedAt") VALUES ('qa','qa','unused','WOWSTORG','QA',now());
    INSERT INTO "WorkTaskBoard" (id,title,"createdById","updatedAt") VALUES ('qa-board','QA','qa',now());
    INSERT INTO "WorkTaskColumn" (id,"boardId",title,"createdById","updatedAt") VALUES ('qa-column','qa-board','QA','qa',now());
    INSERT INTO "WorkTask" (id,"boardId","columnId",title,"createdById","updatedAt") VALUES ('qa-task','qa-board','qa-column','QA','qa',now());
    INSERT INTO "TelegramDirectorInbox" (id,"telegramChatId","messageId","directorUserId","directorName","taskId") VALUES ('123:1','123',1,'qa','QA','qa-task');`);
  await assert.rejects(db.exec(`INSERT INTO "TelegramDirectorInbox" (id,"telegramChatId","messageId","directorUserId","directorName") VALUES ('duplicate','123',1,'qa','QA')`));
  await db.exec(`DELETE FROM "WorkTask" WHERE id='qa-task'`);
  const retained = await db.query(`SELECT "taskId" FROM "TelegramDirectorInbox" WHERE id='123:1'`);
  assert.equal(retained.rows.length, 1); assert.equal(retained.rows[0].taskId, null);
  await assert.rejects(db.exec(`INSERT INTO "TelegramDirectorInbox" (id,"telegramChatId","messageId","directorUserId","directorName") VALUES ('bad-user','123',2,'missing','QA')`));
  console.log(JSON.stringify({ migrations: folders.length, newTables: 2, rls: true, noApiRoleRead: true, uniqueReceipt: true, receiptSurvivesDeletion: true, foreignKeys: true, target: "isolated in-memory PostgreSQL (PGlite)" }));
} finally { await db.close(); }
