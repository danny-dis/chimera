#!/usr/bin/env node

import { CliRouter } from './cli-router.js';

const router = new CliRouter();
router.parse(process.argv);
