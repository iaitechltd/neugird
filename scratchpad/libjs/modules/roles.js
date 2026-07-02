"use strict";
/**
 * RolePermissionCanister — composable, Grid-scoped roles and a simple
 * permission check. One wallet can hold different roles in different Grids
 * (spec page 8). Custom roles are just strings.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.rolesForGrid = rolesForGrid;
exports.rolesForUser = rolesForUser;
exports.assignRole = assignRole;
exports.isAdmin = isAdmin;
const store_1 = require("../store");
const id_1 = require("../id");
function rolesForGrid(grid_id) {
    return store_1.db.users.flatMap((u) => u.roles_by_grid
        .filter((r) => r.grid_id === grid_id)
        .map((r) => ({ user_id: u.id, role: r.role })));
}
function rolesForUser(user_id, grid_id) {
    const user = store_1.db.users.find((u) => u.id === user_id);
    if (!user)
        return [];
    return user.roles_by_grid.filter((r) => r.grid_id === grid_id).map((r) => r.role);
}
function assignRole(user_id, grid_id, role, granted_by) {
    const user = store_1.db.users.find((u) => u.id === user_id);
    if (!user)
        return undefined;
    const assignment = { grid_id, role, granted_by, granted_at: (0, id_1.nowISO)() };
    user.roles_by_grid.push(assignment);
    return assignment;
}
const ADMIN_ROLES = new Set(["GridFounder", "GridAdmin"]);
function isAdmin(user_id, grid_id) {
    return rolesForUser(user_id, grid_id).some((r) => ADMIN_ROLES.has(r));
}
