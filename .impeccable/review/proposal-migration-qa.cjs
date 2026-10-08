// Checks both exact migrations and the SQL Editor bundle in an isolated schema; always rolls back.
// Run: node --env-file=.env.local .impeccable/review/proposal-migration-qa.cjs
const { PrismaClient } = require('@prisma/client');
const { readFileSync } = require('node:fs');
const { randomUUID } = require('node:crypto');
const db = new PrismaClient();
const schema = `qa_proposal_${randomUUID().replaceAll('-', '')}`;
const rollback = new Error('QA_ROLLBACK');
const migrationNames = ['20261007120000_standalone_proposals_v2', '20261008120000_proposal_command_receipts'];
const bundle = readFileSync('docs/sql/deploy_proposal_studio_v2.sql', 'utf8');
const normalize = text => text.replaceAll('\r\n', '\n').trim();
const migrations = migrationNames.map(name => {
  const sql = readFileSync(`prisma/migrations/${name}/migration.sql`, 'utf8');
  const bundled = bundle.split(`-- BEGIN MIGRATION: ${name}\n`)[1]?.split(`-- END MIGRATION: ${name}`)[0];
  if (!bundled || normalize(bundled) !== normalize(sql)) throw new Error(`SQL Editor bundle differs from migration: ${name}`);
  return sql;
});
async function run() {
  let report;
  try {
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
      await tx.$executeRawUnsafe(`CREATE TABLE "User" (id TEXT PRIMARY KEY)`);
      await tx.$executeRawUnsafe(`CREATE TABLE "Customer" (id TEXT PRIMARY KEY)`);
      await tx.$executeRawUnsafe(`CREATE TABLE "Project" (id TEXT PRIMARY KEY)`);
      await tx.$executeRawUnsafe(`CREATE TABLE "CustomerMerge" (id TEXT PRIMARY KEY)`);
      await tx.$executeRawUnsafe(`CREATE TABLE "ProjectProposal" (id TEXT PRIMARY KEY, "projectId" TEXT NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE, "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP)`);
      await tx.$executeRawUnsafe(`INSERT INTO "User" VALUES ('qa-user')`);
      await tx.$executeRawUnsafe(`INSERT INTO "Project" VALUES ('qa-project')`);
      await tx.$executeRawUnsafe(`INSERT INTO "CustomerMerge" VALUES ('existing-merge')`);
      await tx.$executeRawUnsafe(`INSERT INTO "ProjectProposal" (id,"projectId") VALUES ('existing', 'qa-project')`);
      await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '5s'`);
      await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '120s'`);
      for (const sql of migrations) for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
      await tx.$executeRawUnsafe(`INSERT INTO "StandaloneProposal" (id,title,"ownerUserId","updatedAt") VALUES ('qa-temp','QA','qa-user',CURRENT_TIMESTAMP)`);
      await tx.$executeRawUnsafe(`INSERT INTO "ProjectProposal" (id,"standaloneProposalId") VALUES ('temporary','qa-temp')`);
      await tx.$executeRawUnsafe(`DO $$ BEGIN BEGIN INSERT INTO "ProjectProposal" (id) VALUES ('no-owner'); RAISE EXCEPTION 'Missing owner accepted'; EXCEPTION WHEN check_violation THEN NULL; END; BEGIN INSERT INTO "ProjectProposal" (id,"projectId","standaloneProposalId") VALUES ('two-owners','qa-project','qa-temp'); RAISE EXCEPTION 'Two owners accepted'; EXCEPTION WHEN check_violation THEN NULL; END; END $$`);
      await tx.$executeRawUnsafe(`UPDATE "ProjectProposal" SET "projectId"='qa-project', "standaloneProposalId"=NULL WHERE id='temporary'`);
      await tx.$executeRawUnsafe(`INSERT INTO "ProposalMutationReceipt" (id,"proposalId","actorUserId","mutationId","requestHash",action,delta,"resultRevision") VALUES ('receipt','existing','qa-user','mutation','hash','QA','{}',1)`);
      await tx.$executeRawUnsafe(`DO $$ BEGIN BEGIN INSERT INTO "ProposalMutationReceipt" (id,"proposalId","actorUserId","mutationId","requestHash",action,delta,"resultRevision") VALUES ('duplicate','existing','qa-user','mutation','hash','QA','{}',1); RAISE EXCEPTION 'Duplicate receipt accepted'; EXCEPTION WHEN unique_violation THEN NULL; END; END $$`);
      const merge = await tx.$queryRawUnsafe(`SELECT "movedStandaloneProposals" FROM "CustomerMerge" WHERE id='existing-merge'`);
      if (merge[0].movedStandaloneProposals !== 0) throw new Error('Existing customer merge default is incorrect');
      report = await tx.$queryRawUnsafe(`SELECT c.relname AS "table", (SELECT count(*)::int FROM "ProjectProposal") AS "preservedAndMoved", c.relrowsecurity AS rls, has_table_privilege('anon', c.oid, 'SELECT') AS "anonCanRead", has_table_privilege('authenticated', c.oid, 'SELECT') AS "authenticatedCanRead" FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname IN ('StandaloneProposal','ProposalMutationReceipt') ORDER BY c.relname`, schema);
      if (report.length !== 2 || report.some(row => row.preservedAndMoved !== 2 || !row.rls || row.anonCanRead || row.authenticatedCanRead)) throw new Error('Migration verification failed');
      throw rollback;
    }, { timeout: 120000, maxWait: 5000 });
  } catch (error) { if (error !== rollback) throw error; }
  const cleaned = await db.$queryRawUnsafe('SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname=$1) AS exists', schema);
  if (cleaned[0].exists) throw new Error('QA schema was not rolled back');
  console.log(JSON.stringify({ status: 'PASS', bundleMatchesMigrations: true, isolatedSchemaRolledBack: true, existingRowsPreserved: true, ownershipConstraintTested: true, conversionOwnerMoveTested: true, receiptUniquenessTested: true, security: report }));
}
run().catch(error => { console.error(JSON.stringify({ code: error.code, detail: error.meta ?? error.message })); process.exitCode=1; }).finally(() => db.$disconnect());
