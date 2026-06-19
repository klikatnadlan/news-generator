# LeaderFeed (לידרפיד) — Development Guide

## CRITICAL RULES — READ BEFORE ANY CHANGE

### 1. Git Sync (MANDATORY)
```bash
# BEFORE making any changes:
cd /path/to/news-generator-deploy
git pull origin main

# AFTER making changes:
git add -A
git commit -m "description of change"
```
**Never skip git pull.** Other developers work on this codebase. Skipping pull = overwriting their work.

### 2. Never Rewrite Entire Files
- **DO:** Edit specific sections, add new functions, modify existing code
- **DON'T:** Rewrite page.tsx, globals.css, news-card.tsx, or layout.tsx from scratch
- If you need to change a file, read it first, understand the current structure, then make targeted edits

### 3. Design System — LeaderFeed
The app uses a custom design system called **LeaderFeed**. Do NOT change to a different design.

**CSS Variables (defined in globals.css):**
- `--lf-navy: #0f1419` — Primary dark color
- `--lf-bg: #f8f9fb` — Background
- `--lf-surface: #ffffff` — Card background
- `--lf-border: #e8eaed` — Border color
- `--lf-text: #0f1419` — Primary text
- `--lf-red: #dc2626` — Accent red

**CSS Classes:**
- `.lf-header` — Dark sticky header
- `.lf-hero` — Dark gradient hero section
- `.lf-card` — White card with border
- `.lf-card-selected` — Selected card state
- `.lf-btn`, `.lf-btn-dark`, `.lf-btn-red`, `.lf-btn-outline` — Button styles
- `.lf-glass` — Frosted glass effect (floating bars)
- `.lf-ai-box` — Purple AI refine box
- `.lf-animate` — Fade-in animation
- `.lf-stat-pill` — Hero stat pill

**Fonts:** Heebo (Hebrew), DM Sans (numbers/English)

### 4. Critical Files — Handle With Care
| File | What it does | Warning |
|------|-------------|---------|
| `src/app/page.tsx` | Main feed with day filters (א׳-ו׳), Hero section | Don't remove day filters or Hero |
| `src/app/globals.css` | LeaderFeed CSS design system | Don't delete CSS variables/classes |
| `src/app/layout.tsx` | PWA manifest, fonts, viewport | Don't remove PWA support |
| `src/components/news-card.tsx` | News card with LeaderFeed styling | Keep HTML stripping (.replace) |
| `src/app/headlines/page.tsx` | Headlines page with 4 tabs: נדל"ן/כלכלה/הייטק/נרטיב | |
| `src/lib/anthropic.ts` | All AI functions | Don't remove existing exports |

### 5. Architecture
- **Framework:** Next.js 15 (App Router), TypeScript, Tailwind CSS
- **UI Library:** shadcn/ui components + custom LeaderFeed classes
- **Database:** Supabase (news_items, news_scores, generated_texts, etc.)
- **AI:** Claude claude-sonnet-4-6 (generation) + claude-haiku-4-5-20251001 (scoring) via Anthropic SDK
- **Deploy:** Vercel (Hobby plan, 10s timeout for serverless)
- **RSS:** Single curated feed from rss.app

### 6. Key Features (Don't Break These)
- Day-based filtering (א׳ through ו׳) on main page — NOT region/location filters
- Hero section with stats (ידיעות היום, סה"כ השבוע, סריקה אחרונה)
- Headlines page with category tabs (נדל"ן, כלכלה, הייטק, נרטיב)
- Narrative detection (AI identifies running stories)
- Headlines trigger (AI generates framework from selected headlines)
- Archive filtered to score 30+ only
- HTML tag stripping in all displayed text
- PWA support (manifest.json, service worker, icons)
- Week API (/api/news/week) fetches entire week, client filters by day

### 7. Naming Convention
- All UI text is in **Hebrew** (not English)
- "תקציר" not "דיגסט" / "digest"
- "לידרפיד" is the brand name
- "מודיעין נדל״ן · קליקת הנדל״ן" is the subtitle

### 8. API Endpoints
| Route | Purpose |
|-------|---------|
| `/api/news/today` | Today's scored news (score >= 30) |
| `/api/news/week` | This week's scored news (score >= 30) |
| `/api/news/week-all` | All news with auto-classification |
| `/api/generate` | Generate WhatsApp text |
| `/api/digest` | Generate daily digest |
| `/api/narratives` | AI narrative detection |
| `/api/headlines-trigger` | Generate framework from selected headlines |
| `/api/archive` | Search archive (score >= 30 filter) |
| `/api/refine` | Refine text with instruction |
| `/api/article` | Generate article |
| `/api/article-pipeline` | Full article pipeline with checklist |

### 9. Before Deploying
```bash
npm run build  # Must pass with zero errors
npx vercel --prod  # Deploy to production
git add -A && git commit -m "description"  # Save to git
```

### 10. Common Mistakes to Avoid
- Don't import from `@/components/ui/card` in news-card.tsx — it uses custom `.lf-card` classes
- Don't remove `VoicePlayButton` or `VoiceRecordButton` imports
- Don't change the RSS feed URL without testing
- Don't remove the `gte("score", 30)` filter from API endpoints
- Don't use em dashes (—) in Hebrew text
- Don't add `WORKFLOW_STEPS` or step indicators — the Hero section replaces that
