#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const cli_router_js_1 = require("./cli-router.js");
const router = new cli_router_js_1.CliRouter();
router.runCli(process.argv);
//# sourceMappingURL=index.js.map