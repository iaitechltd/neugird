"use strict";
/**
 * GridRegistryCanister — create, update, query Grids and SubGrids.
 * Holds the canonical app state for the core primitive.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.listGrids = listGrids;
exports.getGrid = getGrid;
exports.getGridSummary = getGridSummary;
exports.createGrid = createGrid;
exports.updateGrid = updateGrid;
exports.listSubGrids = listSubGrids;
exports.getSubGrid = getSubGrid;
exports.subGridView = subGridView;
exports.createSubGrid = createSubGrid;
exports.joinGrid = joinGrid;
exports.leaveGrid = leaveGrid;
exports.isMember = isMember;
const store_1 = require("../store");
const id_1 = require("../id");
const Pulse = __importStar(require("./pulse"));
function listGrids(opts) {
    let grids = store_1.db.grids;
    if (opts?.visibility)
        grids = grids.filter((g) => g.visibility === opts.visibility);
    return grids;
}
function getGrid(idOrSlug) {
    return store_1.db.grids.find((g) => g.grid_id === idOrSlug || g.slug === idOrSlug);
}
function getGridSummary(idOrSlug) {
    const grid = getGrid(idOrSlug);
    if (!grid)
        return undefined;
    const subgrids = store_1.db.subgrids.filter((s) => s.parent_grid_id === grid.grid_id);
    const campaigns = store_1.db.campaigns.filter((c) => c.grid_id === grid.grid_id);
    const campaignIds = new Set(campaigns.map((c) => c.campaign_id));
    const openTasks = store_1.db.tasks.filter((t) => campaignIds.has(t.campaign_id) && t.status === "open");
    return {
        grid,
        subgrids: subgrids.length,
        active_campaigns: campaigns.filter((c) => c.status === "active").length,
        open_tasks: openTasks.length,
        recent_pulse: Pulse.forTarget("grid", grid.grid_id).slice(0, 5),
        lifecycle_stage: grid.lifecycle_stage,
    };
}
function createGrid(input) {
    const grid = {
        grid_id: (0, id_1.newId)("grid"),
        owner_id: input.owner_id,
        name: input.name,
        slug: slugify(input.name),
        category: input.category,
        description: input.description,
        visual_theme: { accent: input.accent ?? "#00ff88", glyph: "▦" },
        modules_enabled: input.modules_enabled ?? ["Grid", "SubGrid", "CampaignX", "TalenX", "Pulse"],
        visibility: input.visibility ?? "public",
        treasury_config: { enabled: false },
        pulse_score: 0,
        member_count: 1,
        created_at: (0, id_1.nowISO)(),
        grid_type: input.grid_type ?? "community",
    };
    store_1.db.grids.push(grid);
    const owner = store_1.db.users.find((u) => u.id === input.owner_id);
    if (owner) {
        owner.roles_by_grid.push({ grid_id: grid.grid_id, role: "GridFounder", granted_at: (0, id_1.nowISO)() });
        if (!owner.joined_grids.includes(grid.grid_id))
            owner.joined_grids.push(grid.grid_id);
    }
    return grid;
}
function updateGrid(grid_id, patch) {
    const grid = store_1.db.grids.find((g) => g.grid_id === grid_id);
    if (!grid)
        return undefined;
    Object.assign(grid, patch);
    return grid;
}
function listSubGrids(grid_id) {
    return store_1.db.subgrids.filter((s) => s.parent_grid_id === grid_id);
}
function getSubGrid(id) {
    return store_1.db.subgrids.find((s) => s.subgrid_id === id);
}
/** Full read model for a SubGrid: its parent Grid, members, agents, and jobs. */
function subGridView(id) {
    const subgrid = getSubGrid(id);
    if (!subgrid)
        return undefined;
    const grid = store_1.db.grids.find((g) => g.grid_id === subgrid.parent_grid_id) ?? null;
    const members = subgrid.members
        .map((uid) => store_1.db.users.find((u) => u.id === uid))
        .filter((u) => !!u);
    const agents = (subgrid.agent_members ?? [])
        .map((aid) => store_1.db.agents.find((a) => a.agent_id === aid))
        .filter((a) => !!a);
    const jobs = store_1.db.jobs.filter((j) => j.subgrid_id === id);
    return { subgrid, grid, members, agents, jobs };
}
function createSubGrid(input) {
    const sub = {
        subgrid_id: (0, id_1.newId)("sub"),
        parent_grid_id: input.parent_grid_id,
        name: input.name,
        purpose: input.purpose,
        admins: [input.admin_id],
        members: [input.admin_id],
        campaigns: [],
        pulse_score: 0,
        created_at: (0, id_1.nowISO)(),
    };
    store_1.db.subgrids.push(sub);
    return sub;
}
function joinGrid(grid_id, user_id) {
    const grid = store_1.db.grids.find((g) => g.grid_id === grid_id);
    const user = store_1.db.users.find((u) => u.id === user_id);
    if (!grid || !user)
        return;
    if (!user.joined_grids.includes(grid_id)) {
        user.joined_grids.push(grid_id);
        grid.member_count += 1;
        if (!user.roles_by_grid.some((r) => r.grid_id === grid_id)) {
            user.roles_by_grid.push({ grid_id, role: "Contributor", granted_at: (0, id_1.nowISO)() });
        }
    }
}
function leaveGrid(grid_id, user_id) {
    const grid = store_1.db.grids.find((g) => g.grid_id === grid_id);
    const user = store_1.db.users.find((u) => u.id === user_id);
    if (!grid || !user)
        return;
    if (user.joined_grids.includes(grid_id)) {
        user.joined_grids = user.joined_grids.filter((id) => id !== grid_id);
        grid.member_count = Math.max(0, grid.member_count - 1);
        // keep any non-Contributor roles (e.g. founder); only drop the join role
        user.roles_by_grid = user.roles_by_grid.filter((r) => !(r.grid_id === grid_id && r.role === "Contributor"));
    }
}
function isMember(grid_id, user_id) {
    const user = store_1.db.users.find((u) => u.id === user_id);
    return !!user?.joined_grids.includes(grid_id);
}
function slugify(name) {
    return (name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "grid");
}
