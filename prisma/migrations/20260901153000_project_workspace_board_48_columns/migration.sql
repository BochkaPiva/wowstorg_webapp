-- The free-board canvas was expanded from 24 to 48 columns in the client.
-- Keep database invariants aligned with the validated API contract.
ALTER TABLE "ProjectWorkspaceItem"
  DROP CONSTRAINT IF EXISTS "ProjectWorkspaceItem_x_check",
  DROP CONSTRAINT IF EXISTS "ProjectWorkspaceItem_width_check",
  DROP CONSTRAINT IF EXISTS "ProjectWorkspaceItem_bounds_check";

ALTER TABLE "ProjectWorkspaceItem"
  ADD CONSTRAINT "ProjectWorkspaceItem_x_check" CHECK ("x" BETWEEN 0 AND 47),
  ADD CONSTRAINT "ProjectWorkspaceItem_width_check" CHECK ("width" BETWEEN 2 AND 48),
  ADD CONSTRAINT "ProjectWorkspaceItem_bounds_check" CHECK ("x" + "width" <= 48);
