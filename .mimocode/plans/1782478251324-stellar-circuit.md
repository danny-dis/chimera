# Plan: Install and Execute Chimera from ZIP

## Context

The ZIP file at `C:\Users\pc\Downloads\Kimi_Agent_Chimera TUI Prompt.zip` contains a complete Chimera project source code with packages like `chimera-tools`, `chimera-tui`, `chimera-vscode`, `chimera-workflows`, etc. It also includes an implementation plan for an auto-memory system in `plans/auto-memory-system.md`.

## Execution Steps

### Step 1: Copy extracted project to working directory
- Move contents from `C:\Users\pc\Downloads\Kimi_Agent_Chimera_TUI_Extracted\chimera\*` to the current workspace `C:\Users\pc\Documents\projects\chimera`
- Use `robocopy` to preserve directory structure

### Step 2: Install dependencies
- Run `pnpm install` in the project root

### Step 3: Build the project
- Run `pnpm build` to compile all packages

### Step 4: Start the TUI
- Run `pnpm chimera` to launch the terminal UI

## Critical Files
- `C:\Users\pc\Documents\projects\chimera\package.json` — scripts entry point
- `C:\Users\pc\Documents\projects\chimera\pnpm-workspace.yaml` — workspace config
- `C:\Users\pc\Downloads\Kimi_Agent_Chimera_TUI_Extracted\chimera\plans\auto-memory-system.md` — implementation plan

## Verification
1. `pnpm install` completes without errors
2. `pnpm build` completes successfully
3. `pnpm chimera` launches the TUI
