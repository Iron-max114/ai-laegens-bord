---
name: medrxiv-search
description: Search medRxiv medical preprints via the free CSHL API. No API key required.
keywords:
  - medrxiv
  - medical-preprints
  - clinical-research
  - epidemiology
  - public-health
license: MIT
---

# medRxiv Search

Search recent medRxiv preprints using the free Cold Spring Harbor Laboratory API (`api.medrxiv.org`). No API key, no signup, no cost.

## Requirements

Node.js 18+ (uses built-in `fetch`). Zero external dependencies.

## CRITICAL: Script Path Resolution

The `scripts/search` commands below are relative to this skill's installation directory.

Before running any command, locate the script:

```bash
MEDRXIV_SCRIPT=$(find ~/.claude -name "search" -path "*/medrxiv-search/*/scripts/search" -type f 2>/dev/null | head -1)
```

Then use `$MEDRXIV_SCRIPT` for all commands.

## Commands

### Search by keywords

Fetches papers from the last N days, filters by keyword match in title + abstract, ranks by number of keyword hits.

```bash
scripts/search query "heart failure treatment" --days 30 --max 20
scripts/search query "diabetes" --category "epidemiology" --days 90
scripts/search query "COVID vaccine efficacy" --days 7 --max 50
```

Options:
- `--days N` — date range to search (default: 30)
- `--max N` — maximum results to return (default: 20)
- `--category NAME` — filter by medRxiv category (use `categories` command to list)

### Lookup a paper by DOI

Returns all versions of a specific paper.

```bash
scripts/search doi "10.1101/2024.12.26.24319649"
```

### List categories

Shows all medRxiv categories you can filter by.

```bash
scripts/search categories
```

## When to Use This Skill

- Finding latest medical research before journal publication
- Clinical trial results and outcomes
- Epidemiological studies and public health data
- Rapid response research on emerging health topics
- Any medical preprint search — no auth needed

## Output Format

### Query results

```json
{
  "success": true,
  "type": "medrxiv_search",
  "query": "heart failure",
  "days": 30,
  "date_range": { "from": "2025-01-10", "to": "2025-02-09" },
  "total_fetched": 4523,
  "result_count": 12,
  "results": [
    {
      "doi": "10.1101/2025.01.15.25320585",
      "title": "Paper Title",
      "authors": "Smith, J.; Doe, A.",
      "author_corresponding": "Smith, J.",
      "institution": "University Hospital",
      "date": "2025-01-16",
      "version": "1",
      "category": "cardiovascular medicine",
      "abstract": "Background: ...",
      "published": "NA",
      "url": "https://www.medrxiv.org/content/10.1101/2025.01.15.25320585v1"
    }
  ]
}
```

### DOI lookup

```json
{
  "success": true,
  "type": "medrxiv_doi",
  "doi": "10.1101/2024.12.26.24319649",
  "version_count": 2,
  "results": [...]
}
```

## Processing Results with jq

```bash
# Get titles
scripts/search query "diabetes" | jq -r '.results[].title'

# Get URLs
scripts/search query "diabetes" | jq -r '.results[].url'

# Get abstracts
scripts/search query "diabetes" | jq -r '.results[] | "\(.title)\n\(.abstract)\n---"'
```

## How It Works

The CSHL API returns papers in pages of 100. The `query` command:
1. Calculates the date range from `--days`
2. Fetches all papers in that range (paginating automatically)
3. Filters locally by keyword match in title + abstract
4. Ranks by number of keyword hits
5. Returns top N results

This means broader date ranges fetch more data and take longer. Use `--days 7` for fast searches.

## Error Handling

All commands return JSON with a `success` field:

```json
{ "success": false, "error": "Error message" }
```

Exit codes: `0` = success, `1` = error.

## Architecture

```
scripts/
├── search          # Bash wrapper
└── search.mjs      # Node.js CLI (zero deps, built-in fetch)
```

API: `https://api.medrxiv.org/details/medrxiv/` — free, open, no auth.
