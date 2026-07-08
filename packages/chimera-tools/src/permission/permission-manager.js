"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PermissionManager = void 0;
class PermissionManager {
    rules = [];
    addRule(rule) {
        const existingIndex = this.rules.findIndex(r => r.id === rule.id);
        if (existingIndex >= 0) {
            this.rules[existingIndex] = rule;
        }
        else {
            this.rules.push(rule);
        }
    }
    removeRule(id) {
        const initialLength = this.rules.length;
        this.rules = this.rules.filter(r => r.id !== id);
        return this.rules.length < initialLength;
    }
    async checkPermission(context) {
        const now = new Date();
        const matchingRules = this.rules.filter(rule => {
            if (rule.expiresAt && rule.expiresAt < now) {
                return false;
            }
            return this.matchesRule(rule, context.tool, context.input);
        });
        if (matchingRules.length === 0) {
            return {
                behavior: 'ask',
                source: 'system',
            };
        }
        matchingRules.sort((a, b) => this.specificityScore(b) - this.specificityScore(a));
        const mostSpecificRule = matchingRules[0];
        return {
            behavior: mostSpecificRule.behavior,
            source: mostSpecificRule.source,
            rule: mostSpecificRule,
        };
    }
    matchesRule(rule, tool, input) {
        if (rule.tool !== '*' && rule.tool !== tool) {
            return false;
        }
        if (!rule.pattern) {
            return true;
        }
        if (typeof input === 'string') {
            return new RegExp(rule.pattern).test(input);
        }
        if (typeof input === 'object' && input !== null) {
            const inputStr = JSON.stringify(input);
            return new RegExp(rule.pattern).test(inputStr);
        }
        return false;
    }
    specificityScore(rule) {
        let score = 0;
        if (rule.tool !== '*') {
            score += 10;
        }
        if (rule.pattern) {
            score += 5;
            score += Math.min(rule.pattern.length / 10, 5);
        }
        const sourcePriority = {
            'system': 0,
            'global': 1,
            'project': 2,
            'session': 3,
            'user-prompt': 4,
        };
        score += sourcePriority[rule.source];
        if (rule.expiresAt) {
            score -= 1;
        }
        return score;
    }
}
exports.PermissionManager = PermissionManager;
//# sourceMappingURL=permission-manager.js.map