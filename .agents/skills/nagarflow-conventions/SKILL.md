---
name: nagarflow-conventions
description: A skill providing manual knowledge regarding routing, components, and backend integration within the Nagarflow project. Use this whenever modifying data fetching or navigation structures.
---

# Instructions and Knowledge

When tasked with modifying or creating new pages in this workspace:

1. **Frontend**: Always prioritize using `nagarflow-next/app/` for creating new views or altering UI. This repository uses Next.js with functional React components. Do not write raw HTML/JS if it can be a Next.js component.
2. **Icons and UI Assets**: Utilize Lucide React icons over emojis for any iconography across the Next.js frontend to maintain a premium appearance.
3. **External Context**: Before adding new external dependencies, consult the `./resources/dependencies.txt` overview.
4. **Backend Links**: Make sure frontend API calls point directly to the backend Python service via standard fetch APIs or custom hooks (refer to `app.py`).
