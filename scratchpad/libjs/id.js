"use strict";
/** Tiny ID + timestamp helpers used by the backend modules. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.newId = newId;
exports.nowISO = nowISO;
function newId(prefix) {
    const uuid = typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
    return `${prefix}_${uuid.slice(0, 8)}`;
}
function nowISO() {
    return new Date().toISOString();
}
