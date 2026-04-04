# Continuous Learning and Automation

## Objective
To guarantee that the Nagarflow project's internal knowledge base stays perfectly in sync with the codebase as it evolves, without requiring manual intervention from the user.

## Agent Core Directives (Automated Learning)
As the Antigravity AI assistant, you MUST adhere to this continuous self-updating workflow during all tasks:

1. **Monitor and Learn**: Every time you write new code, implement an architectural change, add a new tech dependency, or figure out a complex bug in this repository, you must index that pattern.
2. **Auto-Update Context**: If you alter the global architecture or structure of the Next.js frontend or Python backend:
   - Immediately use your code editing tools to update `.agents/rules/project-context.md`.
3. **Auto-Expand Skills**: If you create a new specialized component or encounter a localized pattern:
   - Update `.agents/skills/nagarflow-conventions/SKILL.md` or its resource files.
   - If a completely new domain is introduced (e.g., a new database plugin), autonomously create a new folder in `.agents/skills/` with a corresponding `SKILL.md`.
4. **Proactive Execution**: You are authorized and required to modify the `.agents` knowledge files silently *before* concluding your response to the user. Do not wait for the user to tell you to save the knowledge; do it automatically.
