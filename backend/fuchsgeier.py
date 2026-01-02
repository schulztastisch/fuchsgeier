# coding: utf-8
import json
import time
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timezone
from urllib.parse import urlparse, unquote

CONFIG_PATH = "../config.json"
JOBS_PATH = "../jobs.json"
LOG_PATH = "/home/admin/fuchsgeier/logs/no_results.log"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
REQUEST_TIMEOUT = 10
DEFAULT_MAX_FOLLOW_PER_TERM = 5
DEFAULT_SLEEP_BETWEEN_FETCH = 0.8


def load_config():
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def save_jobs(jobs):
    with open(JOBS_PATH, "w", encoding="utf-8") as f:
        json.dump({"jobs": jobs}, f, ensure_ascii=False, indent=2)


def log_no_result(term):
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(f"{datetime.now(timezone.utc).isoformat()}\t{term}\n")
    except Exception:
        pass


def fetch_html(url):
    try:
        resp = requests.get(url, headers={"User-Agent": UA})
        print(f"check: {url}\n Got response: {resp.status_code} {resp}")
        if resp.status_code == 200:
            return resp.text, resp.url
        return None, None
    except Exception:
        return None, None


def parse_job_from_html(html, url):
    soup = BeautifulSoup(html, "html.parser")
    title = ""
    desc = ""
    company = ""
    try:
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                ld = json.loads(script.string or "{}")
            except Exception:
                continue
            arr = ld if isinstance(ld, list) else [ld]
            for entry in arr:
                if not isinstance(entry, dict):
                    continue
                t = entry.get("@type") or entry.get("type")
                if t and ("JobPosting" in t or t == "JobPosting"):
                    title = entry.get("title") or title
                    desc = entry.get("description") or desc
                    hiringOrg = entry.get("hiringOrganization") or {}
                    if isinstance(hiringOrg, dict):
                        company = hiringOrg.get("name") or company
                    break
    except Exception:
        pass
    if not title:
        ttag = soup.find("title")
        if ttag and ttag.text:
            title = ttag.text.strip()
    if not desc:
        md = soup.find("meta", attrs={"name": "description"})
        if md and md.get("content"):
            desc = md.get("content").strip()
    if not desc:
        p = soup.find("p")
        if p and p.get_text(strip=True):
            desc = p.get_text(strip=True)[:400]
    if not title:
        h1 = soup.find("h1")
        if h1 and h1.get_text(strip=True):
            title = h1.get_text(strip=True)
    title = (title or "").strip()
    desc = (desc or "").strip()
    company = (company or "").strip()
    if not title:
        parsed = urlparse(url)
        title = parsed.path.strip(
            "/").replace("-", " ").replace("_", " ")[:120] or url
    return {"title": title, "snippet": desc, "company": company}


def is_valid_job_title(title):
    """Filter out generic/non-job titles"""
    if not title:
        return False
    t = title.lower().strip()
    bad_titles = (
        "anmelden", "sign in", "login", "weitere optionen", "servicelogin",
        "datenschutz", "impressum", "kontakt", "sitemap", "about",
        "startseite", "home", "back", "error", "404", "403",
        "google suche", "search results", "suchergebnisse"
    )
    if any(b in t for b in bad_titles):
        return False
    if len(t) < 4 or len(t) > 500:
        return False
    if not any(c.isalnum() for c in t):
        return False
    return True


def search_jobs_from_portals(keyword, cfg):
    """Scrape job portals - fallback to Wikipedia if needed"""
    max_follow = cfg.get("max_follow_per_term", DEFAULT_MAX_FOLLOW_PER_TERM)
    sleep_between = cfg.get("sleep_between_fetch", DEFAULT_SLEEP_BETWEEN_FETCH)
    results = []

    # German job portals
    portals = [
        ("Stellenanzeigen.de", f"https://www.stellenanzeigen.de/suche/?fulltext={keyword.replace(' ', '+')}"),
        ("StepStone", f"https://www.stepstone.de/jobs/{keyword.replace(' ', '-')}?searchOrigin=Homepage_top-search"),
    ]

    for portal_name, portal_url in portals:
        # if len(results) >= max_follow:
        #    break
        print(f"  [Scraping] {portal_name}...")
        time.sleep(sleep_between)
        try:
            resp = requests.get(portal_url, headers={"User-Agent": UA})
            print(
                f"check: {portal_url}\n Got response: {resp.status_code} {resp}")
            if resp.status_code != 200:
                print(f"    [Status] {resp.status_code}")
                continue

            soup = BeautifulSoup(resp.text, "html.parser")
            job_links = []

            # Look for job listing links
            for a in soup.find_all("a", href=True):
                href = a.get("href", "").strip()
                print(f"Found link {href}")
                if any(k in href.lower() for k in ("job", "stellen", "position", "angebot", "career")):
                    if href.startswith("https") and portal_name in href:
                        job_links.append(href)
                    elif href.startswith("/") and portal_name:
                        # Make relative links absolute
                        parsed = urlparse(portal_url)
                        print(
                            f"checking: {parsed.scheme}://{parsed.netloc}{href}")
                        job_links.append(
                            f"{parsed.scheme}://{parsed.netloc}{href}")

            print(f"    [Found] {len(job_links)} job links")

            for job_url in job_links:
                time.sleep(sleep_between)
                html, final_url = fetch_html(job_url)
                print(f"checking job {job_url}")
                if not html:
                    print("No HTML")
                    continue

                parsed_job = parse_job_from_html(html, final_url or job_url)
                if not is_valid_job_title(parsed_job.get("title")):
                    print("Not valid job title")
                    continue

                snippet = (parsed_job.get("snippet") or "").strip()
                if snippet and len(snippet) < 15:
                    snippet = ""
                print(f"appending job: {parsed_job.get("title").strip()}")
                results.append({
                    "title": parsed_job.get("title").strip(),
                    "url": final_url or job_url,
                    "snippet": snippet,
                    "company": parsed_job.get("company"),
                    "source": portal_name,
                    "fetched_at": datetime.now(timezone.utc).isoformat()
                })
                print(f"    [+] {parsed_job.get('title')[:50]}")

        except Exception as e:
            print(f"    [Error] {str(e)[:50]}")
            continue

    # Fallback to mock data if no results from portals
    if not results:
        print(f"  [Fallback] Using mock data...")
        # results = generate_mock_jobs(keyword, cfg)
    print(f"Found {len(results)} results")
    return results


def main():
    cfg = load_config()
    search_terms = cfg.get("search_terms", [])
    blacklist = [b.lower() for b in cfg.get("blacklist_terms", [])]
    whitelist = [w.lower() for w in cfg.get("whitelist_terms", [])]

    all_jobs = []
    print(f"Starting Fuchsgeier with terms: {search_terms}\n")

    for term in search_terms:
        print(f"Processing: '{term}'")
        items = search_jobs_from_portals(term, cfg)

        if not items:
            log_no_result(term)
            print(f"  ✗ No results\n")
            continue

        print(f"  Got {len(items)} items")
        for it in items:
            txt = (it.get("title", "") + " " + it.get("snippet", "") +
                   " " + it.get("url", "")).lower()
            if any(b in txt for b in blacklist):
                continue
            it["priority"] = 2 if any(w in txt for w in whitelist) else 1
            all_jobs.append(it)
        print()

    # Deduplication
    seen_urls = set()
    seen_titles = set()
    dedup = []

    for j in all_jobs:
        url = j.get("url", "").strip()
        title = j.get("title", "").strip().lower()
        if not url or not title:
            continue

        url_norm = url.rstrip("/")
        if url_norm in seen_urls:
            continue
        if len(title) > 10 and title in seen_titles:
            continue

        seen_urls.add(url_norm)
        seen_titles.add(title)
        dedup.append(j)

    # Sort by priority and recency
    dedup.sort(key=lambda x: (-x.get("priority", 1),
               x.get("fetched_at", "")), reverse=True)
    save_jobs(dedup)
    print(f"✓ Fuchsgeier hat {len(dedup)} Treffer gefunden!")


if __name__ == "__main__":
    main()
