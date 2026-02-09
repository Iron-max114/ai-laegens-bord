#!/usr/bin/env node

/**
 * medRxiv Search via CSHL free API (api.medrxiv.org)
 * Zero dependencies, no auth required.
 */

const API_BASE = 'https://api.medrxiv.org/details/medrxiv';
const PAGE_SIZE = 100;

const CATEGORIES = [
  'addiction medicine', 'allergy and immunology', 'anesthesia',
  'cardiovascular medicine', 'dentistry and oral medicine', 'dermatology',
  'emergency medicine', 'endocrinology', 'epidemiology',
  'forensic medicine', 'gastroenterology', 'genetic and genomic medicine',
  'geriatric medicine', 'health economics', 'health informatics',
  'health policy', 'health systems and quality improvement',
  'hematology', 'hiv/aids', 'infectious diseases',
  'intensive care and critical care medicine', 'medical education',
  'medical ethics', 'nephrology', 'neurology',
  'nursing', 'nutrition', 'obstetrics and gynecology',
  'occupational and environmental health', 'oncology', 'ophthalmology',
  'orthopedics', 'otolaryngology', 'pain medicine',
  'palliative medicine', 'pathology', 'pediatrics',
  'pharmacology and therapeutics', 'primary care research',
  'psychiatry and clinical psychology', 'public and global health',
  'radiology and imaging', 'rehabilitation medicine and physical therapy',
  'respiratory medicine', 'rheumatology', 'sexual and reproductive health',
  'sports medicine', 'surgery', 'toxicology',
  'transplantation', 'urology'
];

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function fetchPage(dateFrom, dateTo, cursor) {
  const url = `${API_BASE}/${dateFrom}/${dateTo}/${cursor}/json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`);
  return res.json();
}

async function fetchAllPapers(dateFrom, dateTo) {
  const papers = [];
  let cursor = 0;
  let total = Infinity;

  while (cursor < total) {
    const data = await fetchPage(dateFrom, dateTo, cursor);
    const msg = data.messages?.[0];
    if (msg) total = msg.total || 0;
    if (data.collection) papers.push(...data.collection);
    cursor += PAGE_SIZE;
    if (!data.collection || data.collection.length === 0) break;
  }

  return papers;
}

function matchesKeywords(paper, keywords) {
  const text = `${paper.title} ${paper.abstract}`.toLowerCase();
  let hits = 0;
  for (const kw of keywords) {
    if (text.includes(kw.toLowerCase())) hits++;
  }
  return hits;
}

function formatPaper(paper) {
  return {
    doi: paper.doi,
    title: paper.title,
    authors: paper.authors,
    author_corresponding: paper.author_corresponding,
    institution: paper.author_corresponding_institution,
    date: paper.date,
    version: paper.version,
    category: paper.category,
    abstract: paper.abstract,
    published: paper.published,
    url: `https://www.medrxiv.org/content/${paper.doi}v${paper.version}`
  };
}

// --- Commands ---

async function cmdQuery(keywords, { days = 30, max = 20, category = null } = {}) {
  const dateTo = new Date();
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - days);

  const allPapers = await fetchAllPapers(formatDate(dateFrom), formatDate(dateTo));

  let filtered = allPapers;
  if (category) {
    const cat = category.toLowerCase();
    filtered = filtered.filter(p => p.category?.toLowerCase() === cat);
  }

  const scored = filtered
    .map(p => ({ paper: p, hits: matchesKeywords(p, keywords) }))
    .filter(x => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, max);

  return {
    success: true,
    type: 'medrxiv_search',
    query: keywords.join(' '),
    days,
    date_range: { from: formatDate(dateFrom), to: formatDate(dateTo) },
    total_fetched: allPapers.length,
    result_count: scored.length,
    results: scored.map(x => formatPaper(x.paper))
  };
}

async function cmdDoi(doi) {
  const url = `${API_BASE}/${doi}/na/json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`);
  const data = await res.json();
  const papers = data.collection || [];

  return {
    success: true,
    type: 'medrxiv_doi',
    doi,
    version_count: papers.length,
    results: papers.map(formatPaper)
  };
}

function cmdCategories() {
  return {
    success: true,
    type: 'medrxiv_categories',
    count: CATEGORIES.length,
    categories: CATEGORIES
  };
}

// --- CLI ---

function parseArgs(args) {
  const opts = {};
  const positional = [];
  let i = 0;
  while (i < args.length) {
    if (args[i] === '--days' && i + 1 < args.length) {
      opts.days = parseInt(args[++i], 10);
    } else if (args[i] === '--max' && i + 1 < args.length) {
      opts.max = parseInt(args[++i], 10);
    } else if (args[i] === '--category' && i + 1 < args.length) {
      opts.category = args[++i];
    } else {
      positional.push(args[i]);
    }
    i++;
  }
  return { opts, positional };
}

(async () => {
  const [,, command, ...rest] = process.argv;
  let result;

  try {
    if (command === 'query') {
      const { opts, positional } = parseArgs(rest);
      const queryStr = positional.join(' ');
      if (!queryStr) {
        result = { success: false, error: 'Query required. Usage: search query "keywords" [--days 30] [--max 20] [--category name]' };
      } else {
        const keywords = queryStr.split(/\s+/).filter(Boolean);
        result = await cmdQuery(keywords, opts);
      }
    } else if (command === 'doi') {
      const doi = rest[0];
      if (!doi) {
        result = { success: false, error: 'DOI required. Usage: search doi "10.1101/..."' };
      } else {
        result = await cmdDoi(doi);
      }
    } else if (command === 'categories') {
      result = cmdCategories();
    } else {
      result = {
        success: false,
        error: `Unknown command: ${command || '(none)'}. Available: query, doi, categories`
      };
    }
  } catch (err) {
    result = { success: false, error: err.message };
  }

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
})();
