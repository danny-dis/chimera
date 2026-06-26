"use strict";
// @chimera/paths — Cross-cutting utilities: logger, event-name helper.
// Public API is exported below; implementation files live alongside.
Object.defineProperty(exports, "__esModule", { value: true });
exports.logEvent = exports.rootLogger = exports.getLogLevel = exports.setLogLevel = exports.createLogger = void 0;
var logger_js_1 = require("./logger.js");
Object.defineProperty(exports, "createLogger", { enumerable: true, get: function () { return logger_js_1.createLogger; } });
Object.defineProperty(exports, "setLogLevel", { enumerable: true, get: function () { return logger_js_1.setLogLevel; } });
Object.defineProperty(exports, "getLogLevel", { enumerable: true, get: function () { return logger_js_1.getLogLevel; } });
Object.defineProperty(exports, "rootLogger", { enumerable: true, get: function () { return logger_js_1.rootLogger; } });
var event_name_js_1 = require("./event-name.js");
Object.defineProperty(exports, "logEvent", { enumerable: true, get: function () { return event_name_js_1.logEvent; } });
//# sourceMappingURL=index.js.map