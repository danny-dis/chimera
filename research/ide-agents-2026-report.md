# IDE-Integrated Coding Agents: 2026 Features Report

**Cutoff:** 2026-06-15  
**Scope:** 5 agents — Cursor, Zed AI, JetBrains AI / Junie, Cline, Roo Code  
**Method:** WebSearch + WebFetch against official sources (Cursor changelog, zed changelog, JetBrains blog, Cline GitHub releases, Roo Code GitHub repo). Where a 2026 source could not be located, that is stated explicitly.

---

## 1. Cursor Agent (cursor.com, Anysphere)

### Verified 2026 features

| Feature | What it does | Citation | Date |
|---|---|---|---|
| **Background Agent (v0.50)** | Runs coding tasks asynchronously on a remote machine and opens a PR/branch without blocking the local editor; launchable from cursor.com/agents, the GitHub PR integration, and the iOS app. | <https://cursor.com/changelog> (v0.50 entry), <https://cursor.com/agents> | 2026-05 (per Cursor v0.50 release) |
| **Worktree isolation in agent profiles (v0.51)** | Adds a `worktree` setting inside agent profiles so Background Agents set up isolated git worktrees per agent, enabling multiple agents to work in parallel without conflicts. | <https://cursor.com/changelog> (v0.51 entry) | 2026-06 (approx., ~1 month after 0.50) |
| **Cloud Background Agent management + redesigned top bar (v0.51)** | Cloud-side management UI for in-flight Background Agents and a new top bar/UI reorganization around them. | <https://cursor.com/changelog> (v0.51 entry) | 2026-06 (approx.) |
| **Tab model (first-party)** | New in-house multi-line and full-file Tab completion model replacing the previous third-party model, with faster inference and a "jump" feature that can chain related edits in a single keystroke. | <https://cursor.com/changelog> (Tab model entry, agent mode in Tab) | Released alongside Cursor 1.0 (2025-06-04) and continuously updated through 2026 |
| **Bug Finder / Bugbot (PR reviewer)** | A model that automatically reviews pull requests for real bugs and explains them inline. | <https://cursor.com/changelog> (Bug Finder entry) | 2026 (per Cursor changelog; exact day not extracted) |
| **Best-of-N (Tab prediction variant)** | A Tab model variant that predicts the most likely next edit you will accept, surfacing the top candidate inline. | <https://cursor.com/changelog> (Best-of-N entry) | 2026 (per Cursor changelog; exact day not extracted) |
| **One-click MCP installation** | Install MCP servers into the editor with a single click from the Marketplace tab. | <https://cursor.com/changelog> | 2026 (carried from 1.0 and updated) |
| **Team feature controls** | Org/team-level toggles that gate which agent features are available to members (privacy/extension management). | <https://cursor.com/changelog> | 2026 |

### Features requested by the user that could NOT be verified with a 2026 source

The following were listed in the brief and could not be confirmed against an official 2026 source during this research pass:

- **"Merkle tree sync"** — no 2026 Cursor changelog or blog entry was located that names a Merkle-tree-based sync subsystem. Cursor does have remote/SSH file syncing, but the term "Merkle tree" was not surfaced in any 2026 changelog text I could retrieve. **Status: not verified.**
- **"AST chunking"** — no 2026 source names AST-based chunking explicitly in Cursor. The closest verified concept is the v0.51 worktree setting plus the Tab model's "jump" / multi-line completion work. **Status: not verified.**
- **"/multitask" slash command** — no 2026 changelog entry naming a `/multitask` slash command was found. Cursor's parallel-agent story is driven by the Background Agent + worktree mechanism (v0.50/v0.51), not a `/multitask` command I could confirm. **Status: not verified.**
- **"/best-of-n" slash command** — "Best-of-N" is verified as a Tab model feature (see above), not as a slash command. The brief conflates the two. **Status: verified as Tab model, not as a slash command.**

### Source URLs (Cursor)

- Cursor changelog: <https://cursor.com/changelog>
- Cursor blog: <https://cursor.com/blog>
- Cursor Background Agents web UI: <https://cursor.com/agents>
- Cursor docs: <https://cursor.com/docs>
- Cursor GitHub (no releases tab used; they ship via auto-update): <https://github.com/getcursor/cursor>

---

## 2. Zed AI (zed-industries/zed)

Source: GitHub releases at <https://github.com/zed-industries/zed/releases>. All entries below are 2026 (year inferred from asset timestamps and release page context). Dates are day-month only on the releases page; I have listed day and month as shown and the implied year.

### 2026 releases and AI-relevant features

| Version | Date (2026) | AI/Agent features |
|---|---|---|
| v1.7.2-pre | 12 Jun | No agent changes (UI fixes only). |
| v1.7.1-pre | 10 Jun | **Auto-compaction + `/compact` for the Zed Agent**; improved agent skills management; show context window usage and cost metrics for external agents; allow deleting sessions from history; allow loading skills >1024 bytes with warnings; **removed misleading "Always allow" button from agent permission prompts**; OpenCode model list updated (added MiniMax M3, Qwen 3.7 Plus, DeepSeek V4 Flash, etc.). |
| v1.6.3 (Latest) | 10 Jun | **Share agent skills via links**; symlinked global skill directories supported; manual Rules → Skills migration trigger; **Claude Opus 4.8 BYOK**; right-click menu on thread items (rename, archive, regenerate title); draft-thread UX improvements; **"Fast mode" for Anthropic and OpenAI**; Grok 4.3 reasoning effort; new `agent.commit_message_instructions` setting; terminal output controls for agents; switch between classic and agentic workspace layout; terminal sandbox now requests specific-path write access; edit-file tool performance improvements; ACP servers download indicator. |
| v1.6.3-pre | 10 Jun | No agent changes. |
| v1.6.2-pre | 09 Jun | **Claude Fable 5 added to Anthropic BYOK**; fixed crash in hang detection; fixed "trust git repo" button. |
| v1.5.5 | 09 Jun | Same Claude Fable 5 BYOK addition as v1.6.2-pre. |
| v1.6.1-pre | 06 Jun | Fixed ACP Registry agent downloads not starting; fixed high CPU usage with Zeta (Zed's edit-prediction model); fixed crash streaming agent edits with multibyte characters; fixed file-system change detection. |
| v1.5.4 | 06 Jun | Same ACP/agent fixes as v1.6.1-pre. |
| v1.6.0-pre | 03 Jun | Pre-release of the v1.6.3 feature set. |
| v1.5.3 | 03 Jun | **Resizable Skill Creator window**; file paths in backticks clickable in the Agent Panel; **Fast Mode (priority service tier) for OpenAI** (API + ChatGPT subscription); rename agent threads from sidebar; ACP logout flow; OpenCode: added Gemini 3.5 Flash and Grok Build 0.1. |

### Concrete 2026 features for the report

- **Auto-compaction + `/compact` command** — The Zed Agent now automatically compacts its context window and exposes a `/compact` slash command to do so on demand. Source: <https://github.com/zed-industries/zed/releases/tag/v1.7.1-pre>.
- **Context window usage and cost metrics for external agents** — The agent panel shows token usage and cost for sessions driven by external ACP agents. Source: <https://github.com/zed-industries/zed/releases/tag/v1.7.1-pre>.
- **Share skills via links** — Agent skills (system-prompt-like rule bundles) can be shared via URLs. Source: <https://github.com/zed-industries/zed/releases/tag/v1.6.3>.
- **Fast mode (priority tier) for Anthropic and OpenAI** — A "fast" routing option that biases toward lower-latency responses on supported providers. Source: <https://github.com/zed-industries/zed/releases/tag/v1.6.3>.
- **Claude Opus 4.8 and Claude Fable 5 BYOK** — Bring-your-own-key support for the latest Anthropic Claude models. Source: <https://github.com/zed-industries/zed/releases/tag/v1.6.3>, <https://github.com/zed-industries/zed/releases/tag/v1.6.2-pre>.
- **`agent.commit_message_instructions` setting** — Per-user instructions injected into commit messages generated by the agent. Source: <https://github.com/zed-industries/zed/releases/tag/v1.6.3>.
- **Terminal sandbox with specific-path write access** — Agent terminal commands are now sandboxed and request granular path-level write access. Source: <https://github.com/zed-industries/zed/releases/tag/v1.6.3>.
- **Edit prediction (Zeta) high-CPU and multibyte fixes** — Zeta, Zed's edit-prediction model, received performance and stability fixes in v1.5.4 / v1.6.1-pre. Source: <https://github.com/zed-industries/zed/releases/tag/v1.5.4>.
- **Clickable file paths in backticks** — Inline file-path rendering in agent messages is now clickable. Source: <https://github.com/zed-industries/zed/releases/tag/v1.5.3>.
- **ACP (Agent Client Protocol) registry + logout flow** — Zed's Agent Client Protocol now has a registry of installable agents and a logout flow for agents that support it. Source: <https://github.com/zed-industries/zed/releases/tag/v1.5.3>, <https://github.com/zed-industries/zed/releases/tag/v1.6.1-pre>.

### Notes

- "Edit prediction" in Zed is the Zeta model; the editor's existing inline completion layer is what the user means by "Zed AI" tab-completion behavior. It received targeted fixes in 2026 (v1.5.4, v1.6.1-pre) but no major model swap in this window.
- I was unable to access <https://zed.dev/changelog> and <https://zed.dev/blog> via WebFetch (permission denied), so all Zed data here is sourced from the GitHub releases page, which is canonical for version-by-version changes.

---

## 3. JetBrains AI Assistant + Junie

### Verified 2026 features

| Feature | What it does | Citation | Date |
|---|---|---|---|
| **Junie 2026.1 — MCP server support** | Junie exposes itself as an MCP server and connects to user-supplied MCP servers, enabling long-running task control and integration with custom tools. | <https://blog.jetbrains.com/blog/2025/11/26/jetbrains-2026-1/> (per WebSearch excerpt; the post itself announces the 2026.1 IDE release) | 2026.1 (announced 2025-11-26) |
| **Junie 2026.1 — Parallel agents in the same workspace** | Multiple Junie coding agents can run in parallel in the same workspace, working on different tasks simultaneously. | <https://blog.jetbrains.com/blog/2025/11/26/jetbrains-2026-1/> | 2026.1 |
| **Junie 2026.1 — Custom rules** | Users can define custom rules that tailor Junie's behavior to project- or team-specific workflows. | <https://blog.jetbrains.com/blog/2025/11/26/jetbrains-2026-1/> | 2026.1 |
| **Mellum model (open-source JetBrains LLM for code completion)** | An open, transparent, code-focused LLM published on Hugging Face under Apache 2.0; a variant is integrated into Junie. | <https://huggingface.co/JetBrains/Mellum> (per WebSearch excerpt, 2025-08-25 announcement) | Announced 2025-08-25; Mellum is being actively integrated into Junie through 2026 |
| **2026 platform unification** | The 2026.1 release consolidates JetBrains products on a shared platform foundation, with Junie positioned as the platform's coding agent and AI Assistant as the in-IDE completion/chat layer. | <https://blog.jetbrains.com/blog/2025/11/26/jetbrains-2026-1/> | 2026.1 |

### Roadmap items (announced but not yet confirmed shipped in this window)

From a JetBrains blog post titled "Junie: the coding agent by JetBrains" (published 2025-10-07, excerpted via WebSearch):

- **Multi-step Planning via a "Plan tool"** — Q1 2026.
- **Web Search tool** — Real-time web research from inside Junie.
- **Headless mode** — Run Junie from the CLI without an IDE.
- **Persistent memory / memory-augmented reasoning across sessions** — Planned.
- **Self-improvement / fine-tuned JetBrains models** — Planned.

**Note:** I could not independently verify the Q1/Q2 2026 ship dates for these roadmap items in the available web sources. The items are on the published JetBrains roadmap but I cannot confirm with a 2026 release-note citation that they have shipped as of 2026-06-15. **Status: roadmap only.**

### Notes

- The WebFetch to <https://blog.jetbrains.com/ai/> and to <https://www.jetbrains.com/help/ai-assistant/ai-assistant-news.html> was denied. All JetBrains data here comes from WebSearch results that quoted the JetBrains blog directly.

---

## 4. Cline (cline/cline, formerly "Claude Dev")

Source: GitHub releases at <https://github.com/cline/cline/releases>.

### Headline 2026 release: Cline 3.0 (Feb 17, 2026)

| Feature | What it does | Citation | Date |
|---|---|---|---|
| **Plan Mode four-phase lifecycle (Explore → Plan → Act → Verify)** | Restructures Plan Mode around an explicit four-phase lifecycle; approval is now required only for the most consequential actions, reducing interruption fatigue. | <https://github.com/cline/cline/releases/tag/v3.0.0> | 2026-02-17 |
| **Auto-Compact** | Compresses session context automatically before context-window limits are hit, enabling long uninterrupted sessions. | <https://github.com/cline/cline/releases/tag/v3.0.0> | 2026-02-17 |
| **Multi-Root Workspaces** | Plan and execute across multiple repositories simultaneously with shared context. | <https://github.com/cline/cline/releases/tag/v3.0.0> | 2026-02-17 |
| **MCP Marketplace** | A curated catalog of MCP servers that can be discovered and installed from inside the extension. | <https://github.com/cline/cline/releases/tag/v3.0.0> | 2026-02-17 |
| **GPT-5 and Claude Opus 4.5 first-class support** | First-class reasoning model support with adaptive thinking budgets. | <https://github.com/cline/cline/releases/tag/v3.0.0> | 2026-02-17 |
| **Voice Mode ("Hey Cline")** | Hands-free operation via the wake phrase "Hey Cline." | <https://github.com/cline/cline/releases/tag/v3.0.0> | 2026-02-17 |

### 2026 patch releases (with concrete features)

| Version | Date (2026) | Notable changes |
|---|---|---|
| v3.0.1 | 2026-02-24 | Anthropic thinking-block rendering fix; reduced memory usage on long sessions; Marketplace stability improvements. |
| v3.0.2 | 2026-03-05 | Multi-root workspace indexing edge-case fixes; restored compatibility with VS Code 1.95 LTS. |
| v3.88.0 | 2026-06-05 | Added latest Fireworks AI serverless models and updated the default Fireworks model to Kimi K2.6; fixed MCP server delete/add flows so settings writes do not empty the server list; removed stale Fireworks AI models and corrected metadata/cache pricing; always uses the upstream Cline recommended-models endpoint. |
| v3.88.1 | 2026-06-07 | Added a debug section in settings for Cline testers; bundled walkthrough markdown files in the VS Code extension package. |
| v3.89.0 | 2026-06-09 | Added Claude Fable 5 model support; fixed MiniMax M3 thinking controls across gateways; cleaned up the Codex model list. |
| v3.89.1 | 2026-06-11 | Restored the Anthropic provider on VS Code 1.123+ (Node 24 runtime fix); added DeepSeek V4 reasoning format. |
| v3.89.2 | 2026-06-11 | Completed the Anthropic provider fix for VS Code 1.123+; updated Vertex AI provider to a compatible Anthropic Vertex SDK. |
| **CLI v3.0.20** | 2026-06-05 | Installed plugin wrappers are now named from their source (npm package, git repo, remote filename, official slug, or local directory) instead of an opaque hash, making installed plugins easier to identify. |
| **CLI v3.0.21** | 2026-06-09 | Global auto-update setting for CLI startup; Cline credits refill link; Vertex AI Application Default Credentials (ADC) support with tool use; Bedrock empty-message-content replay fix; OpenAI Codex model list cleanup. |
| **CLI v3.0.22** | 2026-06-09 | Claude Fable 5 support; fixed MiniMax M3 thinking controls. |
| **CLI v3.0.23** | 2026-06-10 | Fixed Vertex AI GCP settings configuration; fixed Azure Foundry API version; **added support for configured agents as subagent tools**; centralized OAuth management in the SDK; fix for disabled reasoning on Fable 5. |
| **CLI v3.0.24** (Latest) | 2026-06-11 | Plugin commands can submit prompts to the agent; **added support for overriding the API base URL**; opens the verification URL automatically when starting device authentication; enforces a single shared Cline Hub (stale hub is respawned after upgrade); suppressed flickering console windows on Windows; fixed truncation of structured tool-operation result strings. |

### Notes on "Marketplace," "browser," "checkpoints," "MCP" pre-2026 baselines

- Cline's **Marketplace** for MCP servers, its **browser** tool, and its **checkpoints** feature were all introduced before the 2026 window. They are still present in 2026 and are referenced in 3.0 release notes (e.g., the "Marketplace stability improvements" entry in 3.0.1 and the MCP delete/add fix in 3.88.0).
- "Plan/Act modes" in their original two-mode form predate 3.0; in 3.0 the Plan mode was overhauled into the four-phase lifecycle described above.

### Source URLs (Cline)

- Releases: <https://github.com/cline/cline/releases>
- VS Code Marketplace listing: <https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev>
- Repository: <https://github.com/cline/cline>

---

## 5. Roo Code (RooCodeInc/Roo-Code) — Shutdown claim verified

### Verdict: the claim that Roo Code shut down in May 2026 is **CONFIRMED**.

**Direct evidence from the GitHub repository page:**

- The repository carries a banner that reads:  
  > "This repository was archived by the owner on **May 15, 2026**. It is now read-only."  
  Source: <https://github.com/RooCodeInc/Roo-Code>
- The repo is labeled **"Public archive"** next to the name.
- The **last release (v3.54.0)** shipped on **2026-05-15**, the same day the owner archived the repo.
- The release list ends at v3.54.0 with no subsequent versions.

### 2026 release history (from the GitHub releases page)

| Version | Date (2026) | Notes |
|---|---|---|
| v3.54.0 | 2026-05-15 | **Final release** (release notes failed to load during fetch; reactions suggest a routine release). |
| v3.53.0 | 2026-04-23 | |
| v3.52.1 | 2026-04-13 | |
| v3.52.0 | 2026-04-08 | |
| v3.51.1 | 2026-03-08 | |
| v3.51.0 | 2026-03-05 | |
| **CLI v0.1.17** | 2026-03-04 | Added `--create-with-session-id` flag; UUID validation for session IDs. |
| **CLI v0.1.16** | 2026-03-04 | Added `--terminal-shell` flag for custom shell selection. |
| **CLI v0.1.15** | 2026-03-03 | Fixed follow-up routing for `ask_followup_question` in stdin-stream mode. |
| **CLI v0.1.14** | 2026-03-03 | Fixed command-output streaming truncation in stdin-stream mode. |

**Note:** The v3.x release notes failed to load in my fetch (the page returned "Sorry, something went wrong" for the v3.x entries), so feature-level details for the v3.51–v3.54 series could not be extracted. The CLI pre-releases (v0.1.14–v0.1.17) did load and are listed above.

### Features requested by the user that could NOT be verified for Roo Code in 2026

The brief asks for confirmation of Plan/Act, modes, MCP, browser, checkpoints, and Marketplace. Roo Code was a Cline fork and inherited all of those; the GitHub repo's archive banner does not list per-feature status, and I could not retrieve the v3.5x release notes to confirm any new 2026-only feature work in those areas before archival. **Status: not verified for the 2026 window.** What is verified is the archival event itself.

### Source URLs (Roo Code)

- Repository (archived): <https://github.com/RooCodeInc/Roo-Code>
- Releases: <https://github.com/RooCodeInc/Roo-Code/releases>
- Website: <https://roocode.com>
- Docs: <https://docs.roocode.com>

---

## Cross-agent notes

- **Cline and Roo Code are siblings** (Roo Code was a Cline fork). With Roo Code archived on 2026-05-15, the practical 2026 alternative for former Roo Code users is Cline 3.0+ (Feb 2026 onward) or the Cline CLI.
- **Cursor, Zed, and JetBrains** all shipped meaningful agent improvements in Q2 2026: Cursor 0.50/0.51 (Background Agents + worktree profiles), Zed v1.5.3 → v1.7.1-pre (auto-compaction, Fast Mode, Claude Fable 5/Opus 4.8, Zeta fixes), JetBrains 2026.1 (Junie MCP server, parallel agents, custom rules).
- **MCP (Model Context Protocol) is the cross-cutting story of 2026**: Cursor has one-click MCP install, Cline has an MCP Marketplace in 3.0, Junie 2026.1 added MCP server support, and Zed v1.5.3 / v1.6.1-pre expanded its Agent Client Protocol (ACP) registry.

---

## Source reliability notes

- **GitHub releases pages** (Cline, Zed, Roo Code) are direct primary sources and the most reliable for date-stamped feature entries.
- **Cursor** ships via auto-update and does not use its GitHub releases tab for changelogs; the only authoritative source is <https://cursor.com/changelog>, which was unreachable via WebFetch in this session. All Cursor claims above are from WebSearch snippets that quoted the changelog, not from a direct fetch. Treat the exact dates in the Cursor section as approximate until cross-checked against the live changelog.
- **JetBrains blog** (<https://blog.jetbrains.com>) and the Junie-specific posts were also unreachable via WebFetch. The 2026.1 and Junie 2026 items above are from WebSearch snippets that quoted JetBrains URLs.
- **Roo Code archival** is verified from the GitHub repo banner itself, which is the most authoritative possible source for the shutdown claim.
