// Read-only. Uses the normal server connection; never prints keys or row contents.
import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";

nextEnv.loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
try {
  const [report] = await prisma.$queryRaw`
    SELECT count(*)::int AS tables,
      count(*) FILTER (WHERE NOT c.relrowsecurity)::int AS unprotected,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM pg_roles r WHERE r.rolname IN ('anon', 'authenticated')
        AND has_table_privilege(r.oid, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      ))::int AS api_accessible
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')
  `;
  const [routines] = await prisma.$queryRaw`
    SELECT count(*)::int AS api_callable FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
    AND EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname IN ('anon','authenticated')
      AND has_function_privilege(r.oid,p.oid,'EXECUTE'))
  `;
  console.log(JSON.stringify({ ...report, ...routines }));
  if (report.tables === 0 || report.unprotected || report.api_accessible || routines.api_callable) process.exitCode = 1;
} catch (error) {
  console.error(`Database access verification failed (${error.code ?? error.name}).`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
