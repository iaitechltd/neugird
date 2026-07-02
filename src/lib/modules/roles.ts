/**
 * RolePermissionCanister — composable, Grid-scoped roles and a simple
 * permission check. One wallet can hold different roles in different Grids
 * (spec page 8). Custom roles are just strings.
 */

import { db } from "../store";
import { nowISO } from "../id";
import type { RoleAssignment, SystemRole } from "../types";

export function rolesForGrid(grid_id: string): { user_id: string; role: string }[] {
  return db.users.flatMap((u) =>
    u.roles_by_grid
      .filter((r) => r.grid_id === grid_id)
      .map((r) => ({ user_id: u.id, role: r.role }))
  );
}

export function rolesForUser(user_id: string, grid_id: string): string[] {
  const user = db.users.find((u) => u.id === user_id);
  if (!user) return [];
  return user.roles_by_grid.filter((r) => r.grid_id === grid_id).map((r) => r.role);
}

export function assignRole(
  user_id: string,
  grid_id: string,
  role: SystemRole | string,
  granted_by?: string
): RoleAssignment | undefined {
  const user = db.users.find((u) => u.id === user_id);
  if (!user) return undefined;
  const assignment: RoleAssignment = { grid_id, role, granted_by, granted_at: nowISO() };
  user.roles_by_grid.push(assignment);
  return assignment;
}

const ADMIN_ROLES = new Set<string>(["GridFounder", "GridAdmin"]);

export function isAdmin(user_id: string, grid_id: string): boolean {
  return rolesForUser(user_id, grid_id).some((r) => ADMIN_ROLES.has(r));
}
