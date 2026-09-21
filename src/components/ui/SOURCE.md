These component sources are from the official shadcn/ui Base Nova registry:
https://ui.shadcn.com/r/styles/base-nova/{component}.json

Components: alert, badge, button, input, input-group, table, tabs, textarea.
Retrieved 2026-09-21. Upstream: https://github.com/shadcn-ui/ui (MIT).
Only import paths were changed to the local components and cn utility.
Page composition and monochrome theme live in src/main.tsx and src/theme.css.

Run npm run build after changing UI sources. The Node server serves public/ui.js
and public/ui.css. Both language variants can be selected without losing results.
