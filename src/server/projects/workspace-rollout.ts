import "server-only";

import { parseProjectWorkspaceFeatureFlag } from "@/lib/projects/project-workspace-rollout";

export type ProjectWorkspaceFeatures = {
  projectWorkspaceV2: boolean;
  projectEstimateGridV2: boolean;
};

export function getProjectWorkspaceFeatures(): ProjectWorkspaceFeatures {
  return {
    projectWorkspaceV2: parseProjectWorkspaceFeatureFlag(
      process.env.PROJECT_WORKSPACE_V2_ENABLED,
    ),
    projectEstimateGridV2: parseProjectWorkspaceFeatureFlag(
      process.env.PROJECT_ESTIMATE_GRID_V2_ENABLED,
    ),
  };
}
