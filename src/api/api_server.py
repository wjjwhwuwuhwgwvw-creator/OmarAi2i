#!/usr/bin/env python3
from fastapi import FastAPI, HTTPException, BackgroundTasks, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import time
import os
import subprocess
from typing import Optional, Dict, Any, List
import uvicorn
import sys
from contextlib import asynccontextmanager
from datetime import datetime
import aiohttp
import aiofiles
import httpx
import cloudscraper
import re
from bs4 import BeautifulSoup
import requests
from urllib.parse import quote_plus
import trafilatura

DOWNLOADS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'app_cache')
os.makedirs(DOWNLOADS_DIR, exist_ok=True)

APKEEP_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'apkeep')

scraper = cloudscraper.create_scraper(
    browser={
        'browser': 'chrome',
        'platform': 'android',
        'mobile': True
    }
)

httpx_client: Optional[httpx.AsyncClient] = None

async def get_httpx_client() -> httpx.AsyncClient:
    global httpx_client
    if httpx_client is None:
        httpx_client = httpx.AsyncClient(
            timeout=30.0,
            follow_redirects=True,
            headers={
                'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
                'Sec-CH-UA-Mobile': '?1',
            }
        )
    return httpx_client

async def fetch_with_protection(url: str, use_cloudscraper: bool = True) -> Optional[str]:
    """Fetch URL with anti-bot protection bypass using mobile headers"""
    mobile_headers = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Sec-CH-UA': '"Chromium";v="120", "Google Chrome";v="120", "Not_A Brand";v="99"',
        'Sec-CH-UA-Mobile': '?1',
        'Sec-CH-UA-Platform': '"Android"',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-User': '?1',
        'Sec-Fetch-Dest': 'document',
        'Upgrade-Insecure-Requests': '1',
    }
    
    if use_cloudscraper:
        try:
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: scraper.get(url, headers=mobile_headers, timeout=20)
            )
            if response.status_code == 200:
                print(f"[CloudScraper] Success", file=sys.stderr)
                return response.text
        except Exception as e:
            print(f"[CloudScraper] Failed: {e}", file=sys.stderr)
    
    try:
        client = await get_httpx_client()
        response = await client.get(url, headers=mobile_headers)
        if response.status_code == 200:
            print(f"[httpx] Success", file=sys.stderr)
            return response.text
    except Exception as e:
        print(f"[httpx] Failed: {e}", file=sys.stderr)
    
    try:
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: requests.get(url, headers=mobile_headers, timeout=15)
        )
        if response.status_code == 200:
            print(f"[requests] Success", file=sys.stderr)
            return response.text
    except Exception as e:
        print(f"[requests] Failed: {e}", file=sys.stderr)
    
    return None

async def download_with_aria2(url: str, output_path: str, filename: str) -> Optional[str]:
    """Download file using aria2c with multiple connections for speed"""
    try:
        print(f"[aria2] Downloading with 16 connections...", file=sys.stderr)
        start_time = time.time()
        
        result = subprocess.run(
            [
                'aria2c',
                '-x', '16',
                '-s', '16', 
                '-k', '1M',
                '--max-connection-per-server=16',
                '--min-split-size=1M',
                '--file-allocation=none',
                '--continue=true',
                '-d', output_path,
                '-o', filename,
                '--timeout=120',
                '--connect-timeout=30',
                url
            ],
            capture_output=True,
            text=True,
            timeout=300
        )
        
        elapsed = time.time() - start_time
        file_path = os.path.join(output_path, filename)
        
        if os.path.exists(file_path) and os.path.getsize(file_path) > 100000:
            size_mb = os.path.getsize(file_path) / (1024 * 1024)
            print(f"[aria2] Downloaded: {size_mb:.1f} MB in {elapsed:.1f}s", file=sys.stderr)
            return file_path
        
        print(f"[aria2] Failed: {result.stderr}", file=sys.stderr)
        return None
        
    except subprocess.TimeoutExpired:
        print(f"[aria2] Timeout", file=sys.stderr)
        return None
    except Exception as e:
        print(f"[aria2] Error: {e}", file=sys.stderr)
        return None

import zipfile
import io

def detect_real_file_type(file_path: str) -> str:
    """Detect actual file type by inspecting ZIP contents"""
    try:
        with zipfile.ZipFile(file_path, 'r') as zf:
            names = zf.namelist()
            names_lower = [n.lower() for n in names]
            
            if 'manifest.json' in names_lower:
                print(f"[Type Detect] Found manifest.json - this is XAPK", file=sys.stderr)
                return 'xapk'
            
            has_apk = any(n.endswith('.apk') for n in names_lower)
            has_obb = any('.obb' in n for n in names_lower)
            
            if has_apk or has_obb:
                print(f"[Type Detect] Found APK/OBB inside - this is XAPK", file=sys.stderr)
                return 'xapk'
            
            if 'androidmanifest.xml' in names_lower:
                print(f"[Type Detect] Found AndroidManifest.xml at root - this is APK", file=sys.stderr)
                return 'apk'
            
            if 'classes.dex' in names_lower or 'resources.arsc' in names_lower:
                print(f"[Type Detect] Found APK structure - this is APK", file=sys.stderr)
                return 'apk'
            
            print(f"[Type Detect] Unknown structure, files: {names[:5]}", file=sys.stderr)
            return 'apk'
            
    except zipfile.BadZipFile:
        print(f"[Type Detect] Not a valid ZIP file", file=sys.stderr)
        return 'apk'
    except Exception as e:
        print(f"[Type Detect] Error: {e}", file=sys.stderr)
        return 'apk'

async def download_from_apkpure(package_name: str, output_dir: str) -> Optional[str]:
    """Download from APKPure and detect real file type from content"""
    try:
        temp_filename = f"{package_name}.tmp"
        download_url = f"https://d.apkpure.com/b/XAPK/{package_name}?version=latest"
        
        print(f"[APKPure] Downloading {package_name}...", file=sys.stderr)
        result = await download_with_aria2(download_url, output_dir, temp_filename)
        
        if not result or not os.path.exists(result) or os.path.getsize(result) < 100000:
            download_url = f"https://d.apkpure.com/b/APK/{package_name}?version=latest"
            print(f"[APKPure] XAPK failed, trying APK endpoint...", file=sys.stderr)
            result = await download_with_aria2(download_url, output_dir, temp_filename)
        
        if not result or not os.path.exists(result) or os.path.getsize(result) < 100000:
            print(f"[APKPure] Download failed for {package_name}", file=sys.stderr)
            return None
        
        real_type = detect_real_file_type(result)
        final_filename = f"{package_name}.{real_type}"
        final_path = os.path.join(output_dir, final_filename)
        
        if result != final_path:
            os.rename(result, final_path)
            print(f"[APKPure] Renamed to: {final_filename}", file=sys.stderr)
        
        return final_path
        
    except Exception as e:
        print(f"[APKPure] Error: {e}", file=sys.stderr)
        return None

not_found_cache: Dict[str, float] = {}
NOT_FOUND_CACHE_TTL = 3600

async def search_modyolo(query: str, num_results: int = 10) -> List[Dict[str, Any]]:
    """Search MODYOLO for modded APKs - reliable mod source"""
    try:
        print(f"[MODYOLO] Searching: {query}", file=sys.stderr)
        query_lower = query.lower()
        
        all_apps = []
        seen_urls = set()
        headers = {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
        }
        
        loop = asyncio.get_event_loop()
        
        search_url = f"https://modyolo.com/?s={quote_plus(query)}"
        print(f"[MODYOLO] Searching: {search_url}", file=sys.stderr)
        
        try:
            html = await loop.run_in_executor(
                None,
                lambda: requests.get(search_url, headers=headers, timeout=20).text
            )
            
            if html:
                soup = BeautifulSoup(html, 'html.parser')
                
                app_links = soup.find_all('a', href=re.compile(r'modyolo\.com/[^/]+\.html'))
                
                for a in app_links:
                    href = str(a.get('href', '') or '')
                    if not href or href in seen_urls:
                        continue
                    if '/download/' in href or '/?s=' in href:
                        continue
                    seen_urls.add(href)
                    
                    title = str(a.get_text(strip=True) or '')
                    if not title or len(title) < 2:
                        continue
                    
                    parent = a.find_parent(['div', 'li', 'article'])
                    img = a.find('img') or (parent.find('img') if parent else None)
                    icon = ''
                    if img:
                        icon = str(img.get('src') or img.get('data-src') or '')
                    
                    version = ''
                    size = ''
                    mod_info = ''
                    if parent:
                        text = parent.get_text()
                        version_match = re.search(r'(\d+\.\d+(?:\.\d+)*)', text)
                        if version_match:
                            version = version_match.group(1)
                        size_match = re.search(r'(\d+(?:\.\d+)?\s*(?:MB|GB|M|G))', text, re.IGNORECASE)
                        if size_match:
                            size = size_match.group(1)
                        mod_match = re.search(r'(Unlimited|Premium|Unlocked|Mega Menu|VIP|Pro|Full|Mod|Menu)[^\n]*', text, re.IGNORECASE)
                        if mod_match:
                            mod_info = mod_match.group(0).strip()
                    
                    clean_title = re.sub(r'\s*v?\d+\.\d+[^\s]*', '', title)
                    clean_title = re.sub(r'\s*\+\s*\d+.*$', '', clean_title)
                    clean_title = re.sub(r'\s+', ' ', clean_title).strip()
                    
                    all_apps.append({
                        "title": clean_title,
                        "url": href,
                        "icon": icon,
                        "source": "MODYOLO",
                        "isMod": True,
                        "version": version,
                        "size": size,
                        "modInfo": mod_info,
                        "originalTitle": title,
                        "title_lower": clean_title.lower()
                    })
                
                print(f"[MODYOLO] Found {len(all_apps)} apps from search", file=sys.stderr)
        except Exception as search_error:
            print(f"[MODYOLO] Search error: {search_error}", file=sys.stderr)
        
        query_words = query_lower.split()
        matching = []
        
        def is_similar(word1, word2, threshold=0.7):
            if word1 in word2 or word2 in word1:
                return True
            if len(word1) < 3 or len(word2) < 3:
                return word1 == word2
            common = sum(1 for c in word1 if c in word2)
            ratio = common / max(len(word1), len(word2))
            return ratio >= threshold
        
        for app in all_apps:
            title_lower = app["title_lower"]
            if all(word in title_lower for word in query_words):
                matching.append(app)
        
        if not matching:
            for app in all_apps:
                title_lower = app["title_lower"]
                if any(word in title_lower for word in query_words):
                    matching.append(app)
        
        if not matching:
            for app in all_apps:
                title_lower = app["title_lower"]
                title_words = title_lower.split()
                for qword in query_words:
                    for tword in title_words:
                        if is_similar(qword, tword):
                            matching.append(app)
                            break
                    if app in matching:
                        break
        
        if not matching:
            print(f"[MODYOLO] No matching results found for '{query}'", file=sys.stderr)
            return []
        
        results = []
        for app in matching[:num_results]:
            if "title_lower" in app:
                del app["title_lower"]
            app["title"] = app["title"] + " (مهكرة)"
            results.append(app)
        
        print(f"[MODYOLO] Found {len(results)} matching results", file=sys.stderr)
        return results
        
    except Exception as e:
        print(f"[MODYOLO] Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return []

async def get_modyolo_download_link(page_url: str) -> Optional[Dict[str, Any]]:
    """Extract download link from MODYOLO page"""
    try:
        loop = asyncio.get_event_loop()
        headers = {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
        }
        
        print(f"[MODYOLO] Fetching app page: {page_url}", file=sys.stderr)
        
        html = await loop.run_in_executor(
            None,
            lambda: requests.get(page_url, headers=headers, timeout=20).text
        )
        
        if not html:
            print(f"[MODYOLO] Failed to fetch page", file=sys.stderr)
            return None
        
        soup = BeautifulSoup(html, 'html.parser')
        
        download_link = None
        download_links = soup.find_all('a', href=re.compile(r'/download/[^/]+-\d+'))
        
        for link in download_links:
            href = str(link.get('href', '') or '')
            if href:
                if not href.startswith('http'):
                    href = 'https://modyolo.com' + href
                download_link = href
                break
        
        if download_link:
            print(f"[MODYOLO] Found download page: {download_link}", file=sys.stderr)
            
            dl_html = await loop.run_in_executor(
                None,
                lambda url=download_link: requests.get(url, headers=headers, timeout=20).text
            )
            
            if dl_html:
                dl_soup = BeautifulSoup(dl_html, 'html.parser')
                
                final_links = dl_soup.find_all('a', href=re.compile(r'/download/[^/]+-\d+/\d+'))
                
                if final_links:
                    first_link = str(final_links[0].get('href', '') or '')
                    if first_link and not first_link.startswith('http'):
                        first_link = 'https://modyolo.com' + first_link
                    
                    size_text = str(final_links[0].get_text() or '')
                    size_match = re.search(r'(\d+(?:\.\d+)?\s*(?:MB|GB|M|G))', size_text, re.IGNORECASE)
                    size = size_match.group(1) if size_match else ''
                    
                    return {
                        "download_url": first_link,
                        "source": "MODYOLO",
                        "page_url": page_url,
                        "size": size,
                        "note": "Click download link to get APK"
                    }
        
        print(f"[MODYOLO] No download link found", file=sys.stderr)
        return None
        
    except Exception as e:
        print(f"[MODYOLO Download] Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return None

MOD_SOURCES = [
    {"name": "AN1", "search_url": "https://an1.com/?do=search&subaction=search&story={query}", "base_url": "https://an1.com"},
]

async def search_an1(query: str, num_results: int = 10) -> List[Dict[str, Any]]:
    """Search AN1.com for modded APKs"""
    try:
        print(f"[AN1] Searching: {query}", file=sys.stderr)
        search_url = f"https://an1.com/?do=search&subaction=search&story={quote_plus(query)}"
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
        }
        
        loop = asyncio.get_event_loop()
        html = await loop.run_in_executor(
            None,
            lambda: requests.get(search_url, headers=headers, timeout=20).text
        )
        
        if not html:
            print(f"[AN1] Failed to fetch search page", file=sys.stderr)
            return []
        
        soup = BeautifulSoup(html, 'html.parser')
        results = []
        seen_urls = set()
        
        game_links = soup.find_all('a', href=re.compile(r'an1\.com/\d+-[^/]+\.html'))
        
        for a in game_links:
            if len(results) >= num_results:
                break
                
            href = a.get('href', '')
            if not href or href in seen_urls:
                continue
            seen_urls.add(href)
            
            title = a.get('title') or a.get_text(strip=True)
            if not title or len(title) < 3:
                continue
            
            id_match = re.search(r'/(\d+)-([^/]+)\.html', href)
            if not id_match:
                continue
            
            app_id = id_match.group(1)
            
            parent = a.find_parent(['div', 'li', 'article'])
            img = a.find('img') or (parent.find('img') if parent else None)
            icon = ''
            if img:
                icon = img.get('src') or img.get('data-src') or ''
            
            developer = ''
            if parent:
                dev_el = parent.find(text=re.compile(r'^[A-Z][\w\s]+$'))
                if dev_el:
                    developer = str(dev_el).strip()
            
            rating = 0.0
            if parent:
                rating_el = parent.find(class_=re.compile(r'rating|score'))
                if rating_el:
                    try:
                        rating = float(re.search(r'[\d.]+', rating_el.get_text()).group())
                    except:
                        pass
            
            size_match = re.search(r'([\d.]+)\s*(?:Mb|MB|Gb|GB)', str(parent) if parent else '')
            size = size_match.group(0) if size_match else ''
            
            results.append({
                "title": title + " (مهكرة)",
                "originalTitle": title,
                "url": href if href.startswith('http') else f"https://an1.com{href}",
                "appId": app_id,
                "icon": icon,
                "developer": developer,
                "rating": rating,
                "size": size,
                "source": "AN1",
                "isMod": True
            })
        
        print(f"[AN1] Found {len(results)} results", file=sys.stderr)
        return results
        
    except Exception as e:
        print(f"[AN1] Search error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return []

async def get_an1_download_link(page_url: str) -> Optional[Dict[str, Any]]:
    """Extract direct download link from AN1.com page"""
    try:
        print(f"[AN1] Getting download link from: {page_url}", file=sys.stderr)
        
        id_match = re.search(r'/(\d+)-([^/]+)\.html', page_url)
        if not id_match:
            print(f"[AN1] Could not extract app ID from URL", file=sys.stderr)
            return None
        
        app_id = id_match.group(1)
        download_page_url = f"https://an1.com/file_{app_id}-dw.html"
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': page_url,
        }
        
        loop = asyncio.get_event_loop()
        html = await loop.run_in_executor(
            None,
            lambda: requests.get(download_page_url, headers=headers, timeout=20).text
        )
        
        if not html:
            print(f"[AN1] Failed to fetch download page", file=sys.stderr)
            return None
        
        all_links = re.findall(r'(https://files\.an1\.(?:co|net)/[^"\'<>\s]+\.apk)', html)
        download_url = None
        for link in all_links:
            if 'an1store' not in link.lower():
                download_url = link
                break
        
        if download_url:
            print(f"[AN1] Found download: {download_url}", file=sys.stderr)
            
            size_match = re.search(r'([\d.]+)\s*(?:Mb|MB|Gb|GB)', html)
            size = size_match.group(0) if size_match else ''
            
            version_match = re.search(r'[\d.]+(?=\.apk|[_-]an1)', download_url)
            version = version_match.group(0) if version_match else ''
            
            return {
                "download_url": download_url,
                "source": "AN1",
                "page_url": page_url,
                "size": size,
                "version": version
            }
        
        dl_match = re.search(r'href=["\']([^"\']*files\.an1\.co[^"\']+\.apk)["\']', html)
        if dl_match:
            download_url = dl_match.group(1)
            if 'an1store' not in download_url.lower():
                print(f"[AN1] Found download link: {download_url}", file=sys.stderr)
                return {
                    "download_url": download_url,
                    "source": "AN1",
                    "page_url": page_url
                }
        
        print(f"[AN1] No download link found", file=sys.stderr)
        return None
        
    except Exception as e:
        print(f"[AN1] Download error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return None

async def search_mod_apk(query: str, num_results: int = 10) -> List[Dict[str, Any]]:
    """Search for modded APKs - uses MODYOLO as primary source"""
    results = await search_modyolo(query, num_results)
    if results:
        return results
    
    for source in MOD_SOURCES:
        try:
            search_url = source["search_url"].format(query=quote_plus(query))
            html = await fetch_with_protection(search_url, use_cloudscraper=True)
            
            if not html:
                continue
                
            soup = BeautifulSoup(html, 'html.parser')
            
            if source["name"] == "APKMody":
                items = soup.select('article.post, .search-result-item, .game-item')[:num_results]
                for item in items:
                    title_el = item.select_one('h2 a, h3 a, .title a, a.title')
                    if title_el:
                        title = title_el.get_text(strip=True)
                        link = title_el.get('href', '')
                        if link and not link.startswith('http'):
                            link = source["base_url"] + link
                        
                        img_el = item.select_one('img')
                        icon = img_el.get('src', '') if img_el else ''
                        
                        desc_el = item.select_one('.excerpt, .description, p')
                        desc = desc_el.get_text(strip=True)[:100] if desc_el else ''
                        
                        results.append({
                            "title": title,
                            "source": source["name"],
                            "url": link,
                            "icon": icon,
                            "description": desc,
                            "isMod": True
                        })
            
            elif source["name"] == "MODDED1":
                items = soup.select('article.post, .post-item, .game-card')[:num_results]
                for item in items:
                    title_el = item.select_one('h2 a, h3 a, .entry-title a, a.title')
                    if title_el:
                        title = title_el.get_text(strip=True)
                        link = title_el.get('href', '')
                        if link and not link.startswith('http'):
                            link = source["base_url"] + link
                        
                        img_el = item.select_one('img')
                        icon = img_el.get('data-src', '') or img_el.get('src', '') if img_el else ''
                        
                        if 'mod' in title.lower() or 'apk' in title.lower():
                            results.append({
                                "title": title,
                                "source": source["name"],
                                "url": link,
                                "icon": icon,
                                "description": "",
                                "isMod": True
                            })
            
            elif source["name"] == "HAPPYMOD":
                items = soup.select('.pdt-app-box, .app-item, .search-item')[:num_results]
                for item in items:
                    title_el = item.select_one('h3, .app-name, .title, a')
                    if title_el:
                        title = title_el.get_text(strip=True)
                        link_el = item.select_one('a[href]')
                        link = link_el.get('href', '') if link_el else ''
                        if link and not link.startswith('http'):
                            link = source["base_url"] + link
                        
                        img_el = item.select_one('img')
                        icon = img_el.get('data-src', '') or img_el.get('src', '') if img_el else ''
                        
                        results.append({
                            "title": title,
                            "source": source["name"],
                            "url": link,
                            "icon": icon,
                            "description": "",
                            "isMod": True
                        })
            
            if len(results) >= num_results:
                break
                
        except Exception as e:
            print(f"[ModSearch] Error searching {source['name']}: {e}", file=sys.stderr)
            continue
    
    return results[:num_results]

async def get_mod_download_link(page_url: str, source_name: str) -> Optional[Dict[str, Any]]:
    """Extract download link from mod page"""
    try:
        html = await fetch_with_protection(page_url, use_cloudscraper=True)
        if not html:
            return None
        
        soup = BeautifulSoup(html, 'html.parser')
        
        download_link = None
        file_info = {}
        
        download_buttons = soup.select('a[href*="download"], a.download-btn, .download-link a, a[class*="download"]')
        for btn in download_buttons:
            href = btn.get('href', '')
            if href and ('.apk' in href.lower() or 'download' in href.lower()):
                download_link = href
                break
        
        if not download_link:
            download_containers = soup.select('.download-box, .download-area, #download')
            for container in download_containers:
                link = container.select_one('a[href]')
                if link:
                    download_link = link.get('href')
                    break
        
        size_el = soup.select_one('.file-size, .size, [class*="size"]')
        if size_el:
            file_info['size'] = size_el.get_text(strip=True)
        
        version_el = soup.select_one('.version, [class*="version"]')
        if version_el:
            file_info['version'] = version_el.get_text(strip=True)
        
        return {
            "download_url": download_link,
            "source": source_name,
            "page_url": page_url,
            "file_info": file_info
        }
        
    except Exception as e:
        print(f"[ModDownload] Error: {e}", file=sys.stderr)
        return None

async def search_apkpure(query: str, num_results: int = 10) -> List[Dict[str, Any]]:
    """Search APKPure for apps matching the query using mobile site"""
    try:
        search_url = f"https://m.apkpure.com/search?q={quote_plus(query)}"
        
        print(f"[APKPure Search] Searching (mobile): {query}", file=sys.stderr)
        
        html_content = await fetch_with_protection(search_url)
        
        if not html_content:
            print(f"[APKPure Search] Failed to fetch search page", file=sys.stderr)
            return []
        
        soup = BeautifulSoup(html_content, 'lxml')
        apps = []
        seen_ids = set()
        
        def extract_app_id(href):
            if href.startswith('https://apkpure.com/'):
                href = href.replace('https://apkpure.com', '')
            elif href.startswith('https://m.apkpure.com/'):
                href = href.replace('https://m.apkpure.com', '')
            if not href.startswith('/'):
                return None
            parts = [p for p in href.strip('/').split('/') if p]
            if len(parts) >= 2:
                potential_id = parts[-1]
                if 'download' in potential_id.lower():
                    return None
                if '.' in potential_id and potential_id.count('.') >= 1:
                    return potential_id
            return None
        
        first_app = soup.find('div', class_='first')
        if first_app:
            link = first_app.find('a', href=True)
            if link:
                href = link.get('href', '')
                app_id = extract_app_id(href)
                if app_id and app_id not in seen_ids:
                    seen_ids.add(app_id)
                    p1 = first_app.find('p', class_='p1')
                    p2 = first_app.find('p', class_='p2')
                    app_name = p1.get_text(strip=True) if p1 else None
                    developer = p2.get_text(strip=True) if p2 else ''
                    
                    if not app_name:
                        parts = [p for p in href.strip('/').split('/') if p]
                        app_slug = parts[0] if parts else ''
                        app_name = app_slug.replace('-', ' ').title()
                    
                    img = first_app.find('img')
                    icon = img.get('src') or img.get('data-src') if img else None
                    
                    apps.append({
                        'title': app_name,
                        'appId': app_id,
                        'developer': developer,
                        'score': 0.0,
                        'icon': icon
                    })
                    print(f"[APKPure Search] Found (featured): {app_name} ({app_id})", file=sys.stderr)
        
        search_container = soup.find('ul', class_='search-res')
        
        if search_container:
            for li in search_container.find_all('li'):
                if len(apps) >= num_results:
                    break
                
                link = li.find('a', href=True)
                if not link:
                    continue
                
                href = link.get('href', '')
                app_id = extract_app_id(href)
                
                if not app_id or app_id in seen_ids:
                    continue
                seen_ids.add(app_id)
                
                p1 = li.find('p', class_='p1')
                p2 = li.find('p', class_='p2')
                
                app_name = p1.get_text(strip=True) if p1 else None
                developer = p2.get_text(strip=True) if p2 else ''
                
                if not app_name:
                    parts = [p for p in href.strip('/').split('/') if p]
                    app_slug = parts[0] if parts else ''
                    app_name = app_slug.replace('-', ' ').title()
                
                img = li.find('img')
                icon = None
                if img:
                    icon = img.get('src') or img.get('data-src') or img.get('data-original')
                
                score = 0.0
                score_elem = li.find(class_='star')
                if score_elem:
                    try:
                        score = float(score_elem.get_text(strip=True))
                    except:
                        pass
                
                apps.append({
                    'title': app_name,
                    'appId': app_id,
                    'developer': developer,
                    'score': score,
                    'icon': icon
                })
                print(f"[APKPure Search] Found: {app_name} ({app_id})", file=sys.stderr)
        
        print(f"[APKPure Search] Total found: {len(apps)} apps", file=sys.stderr)
        return apps[:num_results]
        
    except Exception as e:
        print(f"[APKPure Search] Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return []

async def extract_content_with_trafilatura(url: str) -> Optional[str]:
    """Extract main content from a URL using trafilatura"""
    try:
        html = await fetch_with_protection(url, use_cloudscraper=True)
        if html:
            extracted = trafilatura.extract(html)
            return extracted
    except Exception as e:
        print(f"[Trafilatura] Error: {e}", file=sys.stderr)
    return None

file_cache: Dict[str, Dict[str, Any]] = {}
download_locks: Dict[str, asyncio.Lock] = {}
pending_deletions: Dict[str, asyncio.Task] = {}

stats = {
    "total_requests": 0,
    "downloads": 0,
    "not_found": 0,
    "cache_hits": 0
}

def get_download_lock(package_name: str) -> asyncio.Lock:
    if package_name not in download_locks:
        download_locks[package_name] = asyncio.Lock()
    return download_locks[package_name]

async def schedule_file_deletion(file_path: str, delay: int = 60):
    await asyncio.sleep(delay)
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
            print(f"[Cleanup] Deleted: {os.path.basename(file_path)}", file=sys.stderr)
    except Exception as e:
        print(f"[Cleanup Error] {file_path}: {e}", file=sys.stderr)

async def cleanup_old_files_async():
    """Async version of cleanup using aiofiles"""
    try:
        now = time.time()
        max_age = 300
        for filename in os.listdir(DOWNLOADS_DIR):
            file_path = os.path.join(DOWNLOADS_DIR, filename)
            if os.path.isfile(file_path):
                file_age = now - os.path.getmtime(file_path)
                if file_age > max_age:
                    try:
                        os.remove(file_path)
                        print(f"[Cleanup] Removed old file: {filename}", file=sys.stderr)
                    except Exception as e:
                        print(f"[Cleanup] Failed to remove {filename}: {e}", file=sys.stderr)
    except Exception as e:
        print(f"[Cleanup Error] {e}", file=sys.stderr)

async def periodic_cleanup():
    while True:
        await asyncio.sleep(60)
        await cleanup_old_files_async()

@asynccontextmanager
async def lifespan(app: FastAPI):
    global httpx_client
    print("[Server] Starting with enhanced protection (cloudscraper, curl-cffi, httpx)...", file=sys.stderr)
    httpx_client = httpx.AsyncClient(
        timeout=30.0,
        follow_redirects=True,
        headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        }
    )
    asyncio.create_task(periodic_cleanup())
    yield
    if httpx_client:
        await httpx_client.aclose()
    print("[Server] Shutting down...", file=sys.stderr)

app = FastAPI(title="APK Download API (Enhanced)", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def download_with_apkeep(package_name: str, output_dir: str) -> Optional[str]:
    try:
        print(f"[apkeep] Downloading {package_name}...", file=sys.stderr)
        start_time = time.time()
        
        result = subprocess.run(
            [APKEEP_PATH, "-a", package_name, output_dir],
            capture_output=True,
            text=True,
            timeout=300
        )
        
        elapsed = time.time() - start_time
        
        if "downloaded successfully" in result.stdout.lower():
            for ext in ['.xapk', '.apk', '.apks']:
                file_path = os.path.join(output_dir, f"{package_name}{ext}")
                if os.path.exists(file_path):
                    size_mb = os.path.getsize(file_path) / (1024 * 1024)
                    print(f"[apkeep] Downloaded {package_name}: {size_mb:.1f} MB in {elapsed:.1f}s", file=sys.stderr)
                    return file_path
        
        if "could not get download url" in result.stdout.lower() or "skipping" in result.stdout.lower():
            print(f"[apkeep] App not found: {package_name}", file=sys.stderr)
            return None
            
        print(f"[apkeep] Failed: {result.stdout} {result.stderr}", file=sys.stderr)
        return None
        
    except subprocess.TimeoutExpired:
        print(f"[apkeep] Timeout for {package_name}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"[apkeep] Error: {e}", file=sys.stderr)
        return None

@app.get("/")
async def root():
    return {
        "status": "running",
        "engine": "apkeep + aria2 + cloudscraper + curl-cffi + httpx",
        "features": [
            "CloudScraper bypass",
            "curl-cffi impersonation",
            "httpx async client",
            "aria2 multi-connection download",
            "lxml fast parsing",
            "trafilatura content extraction"
        ],
        "stats": stats
    }

@app.head("/download/{package_name}")
async def head_download_apk(package_name: str):
    """Return file size without downloading - for size check before download"""
    for ext in ['.xapk', '.apk', '.apks']:
        cached_path = os.path.join(DOWNLOADS_DIR, f"{package_name}{ext}")
        if os.path.exists(cached_path):
            file_size = os.path.getsize(cached_path)
            if file_size > 100000:
                return Response(
                    content=b"",
                    headers={
                        "Content-Length": str(file_size),
                        "X-File-Type": ext[1:],
                        "X-Cached": "true"
                    }
                )
    return Response(content=b"", headers={"Content-Length": "0", "X-Cached": "false"})

@app.get("/download/{package_name}")
async def download_apk(package_name: str, background_tasks: BackgroundTasks, force_apkeep: bool = False, request: Request = None):
    stats["total_requests"] += 1
    now = time.time()
    
    force_apkeep_header = False
    if request and request.headers.get("X-Force-Apkeep") == "true":
        force_apkeep_header = True
    
    use_apkeep_only = force_apkeep or force_apkeep_header
    
    if package_name in not_found_cache:
        if now - not_found_cache[package_name] < NOT_FOUND_CACHE_TTL:
            print(f"[Cache] {package_name} is cached as not found", file=sys.stderr)
            stats["cache_hits"] += 1
            raise HTTPException(status_code=404, detail=f"App {package_name} not found (cached)")
        else:
            del not_found_cache[package_name]
    
    lock = get_download_lock(package_name)
    
    async with lock:
        if not use_apkeep_only:
            for ext in ['.xapk', '.apk', '.apks']:
                cached_path = os.path.join(DOWNLOADS_DIR, f"{package_name}{ext}")
                if os.path.exists(cached_path):
                    file_size = os.path.getsize(cached_path)
                    if file_size > 100000:
                        print(f"[Cache] Serving cached file: {package_name}", file=sys.stderr)
                        stats["cache_hits"] += 1
                        file_type = ext[1:]
                        return FileResponse(
                            path=cached_path,
                            filename=f"{package_name}{ext}",
                            media_type="application/octet-stream",
                            headers={
                                "X-Source": "cache",
                                "X-File-Type": file_type,
                                "X-File-Size": str(file_size),
                                "Cache-Control": "no-cache"
                            }
                        )
        
        file_path = None
        source = None
        
        if use_apkeep_only:
            print(f"[Download] Force using apkeep for {package_name}...", file=sys.stderr)
            loop = asyncio.get_event_loop()
            file_path = await loop.run_in_executor(
                None,
                download_with_apkeep,
                package_name,
                DOWNLOADS_DIR
            )
            if file_path:
                source = "apkeep"
        else:
            print(f"[Download] Trying APKPure+aria2 for {package_name}...", file=sys.stderr)
            file_path = await download_from_apkpure(package_name, DOWNLOADS_DIR)
            if file_path:
                source = "aria2+apkpure"
            
            if not file_path:
                print(f"[Download] Falling back to apkeep for {package_name}...", file=sys.stderr)
                loop = asyncio.get_event_loop()
                file_path = await loop.run_in_executor(
                    None,
                    download_with_apkeep,
                    package_name,
                    DOWNLOADS_DIR
                )
                if file_path:
                    source = "apkeep"
        
        if not file_path or not os.path.exists(file_path):
            not_found_cache[package_name] = time.time()
            stats["not_found"] += 1
            print(f"[Not Found] {package_name} added to cache for 1 hour", file=sys.stderr)
            raise HTTPException(status_code=404, detail=f"App {package_name} not found")
        
        file_size = os.path.getsize(file_path)
        file_type = os.path.splitext(file_path)[1][1:]
        stats["downloads"] += 1
        
        deletion_task = asyncio.create_task(schedule_file_deletion(file_path, 60))
        pending_deletions[package_name] = deletion_task
        
        print(f"[Success] {package_name} downloaded via {source}: {file_size/(1024*1024):.1f} MB", file=sys.stderr)
        
        return FileResponse(
            path=file_path,
            filename=os.path.basename(file_path),
            media_type="application/octet-stream",
            headers={
                "X-Source": source,
                "X-File-Type": file_type,
                "X-File-Size": str(file_size),
                "Cache-Control": "no-cache"
            }
        )

@app.get("/info/{package_name}")
async def get_info(package_name: str):
    if package_name in not_found_cache:
        now = time.time()
        if now - not_found_cache[package_name] < NOT_FOUND_CACHE_TTL:
            raise HTTPException(status_code=404, detail=f"App {package_name} not found (cached)")
    
    return {
        "package_name": package_name,
        "source": "apkeep",
        "status": "available"
    }

@app.get("/not-found-cache")
async def get_not_found_cache():
    now = time.time()
    result = {}
    for pkg, timestamp in not_found_cache.items():
        remaining = NOT_FOUND_CACHE_TTL - (now - timestamp)
        if remaining > 0:
            result[pkg] = {
                "cached_at": datetime.fromtimestamp(timestamp).isoformat(),
                "expires_in_minutes": round(remaining / 60, 1)
            }
    return {"not_found_apps": result, "count": len(result)}

@app.delete("/not-found-cache/{package_name}")
async def remove_from_not_found_cache(package_name: str):
    if package_name in not_found_cache:
        del not_found_cache[package_name]
        return {"status": "removed", "package": package_name}
    return {"status": "not_in_cache", "package": package_name}

@app.delete("/cache")
async def clear_cache():
    global not_found_cache, file_cache
    
    for task in pending_deletions.values():
        task.cancel()
    pending_deletions.clear()
    
    for filename in os.listdir(DOWNLOADS_DIR):
        try:
            os.remove(os.path.join(DOWNLOADS_DIR, filename))
        except:
            pass
    
    not_found_cache = {}
    file_cache = {}
    
    return {"status": "cache_cleared"}

@app.get("/stats")
async def get_stats():
    return {
        "stats": stats,
        "cached_not_found": len(not_found_cache),
        "downloads_dir_size": sum(
            os.path.getsize(os.path.join(DOWNLOADS_DIR, f))
            for f in os.listdir(DOWNLOADS_DIR)
            if os.path.isfile(os.path.join(DOWNLOADS_DIR, f))
        ) / (1024 * 1024)
    }

@app.get("/search")
async def search_apps(q: str, num: int = 10, combined: bool = True):
    """Combined search: APKPure (normal) + MODYOLO (مهكرة mods)"""
    if not q or len(q.strip()) == 0:
        raise HTTPException(status_code=400, detail="Search query is required")
    
    query = q.strip()
    
    if combined:
        normal_task = asyncio.create_task(search_apkpure(query, num))
        mod_task = asyncio.create_task(search_modyolo(query, num))
        
        normal_results, mod_results = await asyncio.gather(normal_task, mod_task)
        
        all_results = []
        for app in normal_results:
            app["isMod"] = False
            app["source"] = "APKPure"
            all_results.append(app)
        
        all_results.extend(mod_results)
        
        return {
            "query": query,
            "count": len(all_results),
            "normal_count": len(normal_results),
            "mod_count": len(mod_results),
            "results": all_results
        }
    else:
        results = await search_apkpure(query, min(num, 20))
        return {
            "query": query,
            "count": len(results),
            "results": results
        }

@app.get("/search-normal")
async def search_normal_apps(q: str, num: int = 10):
    """Search for normal apps on APKPure only"""
    if not q or len(q.strip()) == 0:
        raise HTTPException(status_code=400, detail="Search query is required")
    
    results = await search_apkpure(q.strip(), min(num, 20))
    
    return {
        "query": q,
        "count": len(results),
        "results": results
    }

@app.get("/app/{package_name}")
async def get_app_details(package_name: str):
    """Get app details by package name - search if exact match"""
    results = await search_apkpure(package_name, 1)
    
    if not results:
        raise HTTPException(status_code=404, detail=f"App {package_name} not found")
    
    exact_match = None
    for app in results:
        if app.get('appId') == package_name:
            exact_match = app
            break
    
    if exact_match:
        return exact_match
    
    return results[0] if results else None

@app.get("/extract")
async def extract_url_content(url: str):
    """Extract main content from a URL using trafilatura"""
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")
    
    content = await extract_content_with_trafilatura(url)
    
    if not content:
        raise HTTPException(status_code=404, detail="Could not extract content from URL")
    
    return {
        "url": url,
        "content": content
    }

@app.get("/search-mod")
async def search_mod_apps(q: str, num: int = 10, source: str = "all"):
    """Search for modded APKs from MODYOLO + AN1 (مهكرة)"""
    if not q or len(q.strip()) == 0:
        raise HTTPException(status_code=400, detail="Search query is required")
    
    query = q.strip()
    
    modyolo_task = asyncio.create_task(search_modyolo(query, num))
    an1_task = asyncio.create_task(search_an1(query, num))
    
    modyolo_results, an1_results = await asyncio.gather(modyolo_task, an1_task)
    
    all_results = modyolo_results + an1_results
    
    return {
        "query": q,
        "count": len(all_results),
        "results": all_results[:num*2],
        "sources": ["MODYOLO", "AN1"],
        "warning": "⚠️ Modded APKs may contain security risks. Download at your own risk."
    }

@app.get("/search-modyolo")
async def search_modyolo_apps(q: str, num: int = 10):
    """Search for modded APKs from MODYOLO (مهكرة)"""
    if not q or len(q.strip()) == 0:
        raise HTTPException(status_code=400, detail="Search query is required")
    
    results = await search_modyolo(q.strip(), min(num, 20))
    
    return {
        "query": q,
        "count": len(results),
        "results": results,
        "source": "MODYOLO",
        "warning": "⚠️ Modded APKs may contain security risks. Download at your own risk."
    }

@app.get("/modyolo-download")
async def get_modyolo_download(url: str):
    """Get download link from MODYOLO page URL"""
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")
    
    download_info = await get_modyolo_download_link(url)
    
    if not download_info or not download_info.get("download_url"):
        raise HTTPException(status_code=404, detail="Could not find download link")
    
    return {
        **download_info,
        "warning": "⚠️ Modded APKs may contain security risks."
    }

@app.get("/search-an1")
async def search_an1_apps(q: str, num: int = 10):
    """Search for modded APKs from AN1.com (مهكرة)"""
    if not q or len(q.strip()) == 0:
        raise HTTPException(status_code=400, detail="Search query is required")
    
    results = await search_an1(q.strip(), min(num, 20))
    
    return {
        "query": q,
        "count": len(results),
        "results": results,
        "source": "AN1",
        "warning": "⚠️ Modded APKs may contain security risks. Download at your own risk."
    }

@app.get("/an1-download")
async def get_an1_download(url: str):
    """Get direct download link from AN1.com page URL"""
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")
    
    download_info = await get_an1_download_link(url)
    
    if not download_info or not download_info.get("download_url"):
        raise HTTPException(status_code=404, detail="Could not find download link")
    
    return {
        **download_info,
        "warning": "⚠️ Modded APKs may contain security risks."
    }

@app.get("/mod-download-info")
async def get_mod_download_info(url: str, source: str = ""):
    """Get download information from a mod page"""
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")
    
    info = await get_mod_download_link(url, source)
    
    if not info or not info.get("download_url"):
        raise HTTPException(status_code=404, detail="Could not find download link")
    
    return {
        **info,
        "warning": "⚠️ Modded APKs may contain malware. Install at your own risk."
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
