"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeNodeArtifact = writeNodeArtifact;
/**
 * Artifact tracking for workflow node outputs.
 */
const promises_1 = require("fs/promises");
const path_1 = require("path");
async function writeNodeArtifact(artifactsDir, nodeId, output, metadata) {
    const nodesDir = (0, path_1.join)(artifactsDir, 'nodes');
    await (0, promises_1.mkdir)(nodesDir, { recursive: true });
    // Write output markdown
    await (0, promises_1.writeFile)((0, path_1.join)(nodesDir, `${nodeId}.md`), output, 'utf-8');
    // Write metadata JSON if provided
    if (metadata) {
        await (0, promises_1.writeFile)((0, path_1.join)(nodesDir, `${nodeId}.meta.json`), JSON.stringify(metadata, null, 2), 'utf-8');
    }
}
//# sourceMappingURL=artifacts-index.js.map