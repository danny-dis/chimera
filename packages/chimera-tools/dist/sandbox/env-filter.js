"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnvironmentFilter = void 0;
const zod_1 = require("zod");
const EnvironmentFilterConfigSchema = zod_1.z.object({
    allowedVars: zod_1.z.array(zod_1.z.string()).optional(),
    blockedVars: zod_1.z.array(zod_1.z.string()).optional(),
    blockedPatterns: zod_1.z.array(zod_1.z.instanceof(RegExp)).optional(),
});
const DEFAULT_BLOCKED_VARS = [
    'PASSWORD', 'PASSWD', 'PWD', 'SECRET', 'TOKEN', 'KEY',
    'CREDENTIAL', 'AUTH', 'API_KEY', 'PRIVATE_KEY', 'ACCESS_KEY',
    'SECRET_KEY', 'DATABASE_URL', 'CONNECTION_STRING',
];
class EnvironmentFilter {
    blockedVars;
    blockedPatterns;
    constructor(config = {}) {
        EnvironmentFilterConfigSchema.parse(config);
        this.blockedVars = new Set(config.blockedVars ?? DEFAULT_BLOCKED_VARS);
        this.blockedPatterns = config.blockedPatterns ?? [
            /PASSWORD/i,
            /SECRET/i,
            /TOKEN/i,
            /KEY$/i,
            /CREDENTIAL/i,
            /AUTH/i,
        ];
    }
    filter(env) {
        const filtered = {};
        for (const [name, value] of Object.entries(env)) {
            if (this.isBlocked(name)) {
                continue;
            }
            filtered[name] = value;
        }
        return filtered;
    }
    isSecretVar(name) {
        return this.isBlocked(name);
    }
    isBlocked(name) {
        if (this.blockedVars.has(name)) {
            return true;
        }
        for (const pattern of this.blockedPatterns) {
            if (pattern.test(name)) {
                return true;
            }
        }
        const upperName = name.toUpperCase();
        for (const blocked of this.blockedVars) {
            if (upperName.includes(blocked.toUpperCase())) {
                return true;
            }
        }
        return false;
    }
}
exports.EnvironmentFilter = EnvironmentFilter;
//# sourceMappingURL=env-filter.js.map