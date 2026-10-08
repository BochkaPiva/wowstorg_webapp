// Read-only check after applying docs/sql/deploy_proposal_studio_v2.sql.
// Run: node --env-file=.env.local .impeccable/review/proposal-release-preflight.cjs
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
async function run() {
  const security = await db.$queryRawUnsafe(`
    SELECT c.relname AS name, c.relrowsecurity AS rls,
      has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS anon_access,
      has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS authenticated_access
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN ('StandaloneProposal','ProposalMutationReceipt')
    ORDER BY c.relname`);
  if (security.length !== 2 || security.some(row => !row.rls || row.anon_access || row.authenticated_access)) throw new Error('New tables or access restrictions are missing');
  const columns = await db.$queryRawUnsafe(`SELECT table_name, column_name, is_nullable, data_type, column_default
    FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('StandaloneProposal','ProposalMutationReceipt','ProjectProposal','CustomerMerge')`);
  const requiredColumns = {
    StandaloneProposal: ['id','title','customerId','leadCustomerName','ownerUserId','convertedAt','convertedProjectId','createdAt','updatedAt'],
    ProposalMutationReceipt: ['id','proposalId','actorUserId','mutationId','requestHash','action','delta','resultRevision','reversedByMutationId','createdAt'],
    ProjectProposal: ['standaloneProposalId'], CustomerMerge: ['movedStandaloneProposals'],
  };
  for (const [table, names] of Object.entries(requiredColumns)) for (const name of names) {
    if (!columns.some(col => col.table_name === table && col.column_name === name)) throw new Error(`Column missing: ${table}.${name}`);
  }
  if (!columns.some(col => col.table_name === 'ProjectProposal' && col.column_name === 'projectId' && col.is_nullable === 'YES')) throw new Error('Project owner must be nullable');
  if (!columns.some(col => col.table_name === 'CustomerMerge' && col.column_name === 'movedStandaloneProposals' && col.is_nullable === 'NO' && col.data_type === 'integer' && col.column_default === '0')) throw new Error('Customer merge column default differs');
  const indexes = await db.$queryRawUnsafe(`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename IN ('StandaloneProposal','ProposalMutationReceipt','ProjectProposal')`);
  const requiredIndexes = ['StandaloneProposal_pkey','StandaloneProposal_convertedProjectId_idx','StandaloneProposal_customerId_idx','StandaloneProposal_ownerUserId_idx','StandaloneProposal_convertedAt_idx','StandaloneProposal_updatedAt_idx','ProjectProposal_standaloneProposalId_key','ProjectProposal_standaloneProposalId_updatedAt_idx','ProposalMutationReceipt_pkey','ProposalMutationReceipt_proposalId_actorUserId_mutationId_key','ProposalMutationReceipt_proposalId_createdAt_idx'];
  for (const name of requiredIndexes) if (!indexes.some(row => row.indexname === name)) throw new Error(`Index missing: ${name}`);
  const constraints = await db.$queryRawUnsafe(`SELECT c.conname, c.convalidated, pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
    WHERE n.nspname='public' AND c.conname IN ('StandaloneProposal_customerId_fkey','StandaloneProposal_ownerUserId_fkey','StandaloneProposal_convertedProjectId_fkey','ProjectProposal_standaloneProposalId_fkey','ProjectProposal_exactly_one_owner','ProposalMutationReceipt_proposalId_fkey')`);
  if (constraints.length !== 6 || constraints.some(row => !row.convalidated)) throw new Error('Ownership/FK constraints are missing or unvalidated');
  const owner = constraints.find(row => row.conname === 'ProjectProposal_exactly_one_owner');
  if (!owner.definition.includes('projectId') || !owner.definition.includes('standaloneProposalId') || !owner.definition.includes('= 1')) throw new Error('Ownership check differs');
  // Exercise the actual generated Prisma read model without retrieving any user data.
  await db.standaloneProposal.findMany({ take: 1, select: { id: true } });
  await db.proposalMutationReceipt.findMany({ take: 1, select: { id: true } });
  console.log(JSON.stringify({ status: 'STUDIO_V2_SCHEMA_READY', readOnly: true, columnsChecked: true, requiredIndexes: requiredIndexes.length, validatedConstraints: constraints.length, prismaReads: 'PASS', security }));
}
run().catch(error => { console.error(JSON.stringify({ code: error.code, message: error.message })); process.exitCode = 1; }).finally(() => db.$disconnect());
