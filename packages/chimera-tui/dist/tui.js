"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TUI = void 0;
const react_1 = __importDefault(require("react"));
const ink_1 = require("ink");
const TUI = () => {
    return (react_1.default.createElement(ink_1.Box, { flexDirection: "column" },
        react_1.default.createElement(ink_1.Text, { bold: true }, "Chimera"),
        react_1.default.createElement(ink_1.Text, null, "Terminal-native parallel multi-agent coding platform"),
        react_1.default.createElement(ink_1.Text, { dimColor: true }, "v0.0.1")));
};
exports.TUI = TUI;
//# sourceMappingURL=tui.js.map