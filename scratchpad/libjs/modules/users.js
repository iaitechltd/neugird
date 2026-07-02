"use strict";
/**
 * Users — identity records. Wallet-keyed upsert powers Sign-In-With-Solana:
 * the first time a wallet signs in we mint a fresh profile for it.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUser = getUser;
exports.listAll = listAll;
exports.findByWallet = findByWallet;
exports.upsertByWallet = upsertByWallet;
const store_1 = require("../store");
const id_1 = require("../id");
function getUser(id) {
    return store_1.db.users.find((u) => u.id === id);
}
function listAll() {
    return store_1.db.users;
}
function findByWallet(wallet) {
    return store_1.db.users.find((u) => u.wallet_addresses.includes(wallet));
}
function upsertByWallet(wallet) {
    const existing = findByWallet(wallet);
    if (existing)
        return existing;
    const user = {
        id: `usr_${wallet.slice(0, 12).toLowerCase()}`,
        wallet_addresses: [wallet],
        username: wallet.length > 8 ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : wallet,
        skills: [],
        roles_by_grid: [],
        pulse_score: 0,
        reputation: { total: 0, by_dimension: {} },
        reward: { accrued: 0, sybil_adjusted: 0, claimed: 0 },
        joined_grids: [],
        created_at: (0, id_1.nowISO)(),
    };
    store_1.db.users.push(user);
    return user;
}
