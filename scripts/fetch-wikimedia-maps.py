#!/usr/bin/env python3
"""
Query Wikimedia Commons API in batches to find locator map SVGs for 82 locations.
Batches up to 50 titles per request to avoid rate limiting.
"""

import urllib.request
import urllib.parse
import json
import time

API = "https://commons.wikimedia.org/w/api.php"

LOCATIONS = {
    # US States
    "alaska":         ["Alaska in United States (zoom).svg", "Alaska in United States.svg", "Map of USA AK.svg"],
    "arizona":        ["Arizona in United States (zoom).svg", "Arizona in United States.svg", "Map of USA AZ.svg"],
    "arkansas":       ["Arkansas in United States (zoom).svg", "Arkansas in United States.svg", "Map of USA AR.svg"],
    "california":     ["California in United States (zoom).svg", "California in United States.svg", "Map of USA CA.svg"],
    "colorado":       ["Colorado in United States (zoom).svg", "Colorado in United States.svg", "Map of USA CO.svg"],
    "florida":        ["Florida in United States (zoom).svg", "Florida in United States.svg", "Map of USA FL.svg"],
    "georgia":        ["Georgia (U.S. state) in United States (zoom).svg", "Georgia in United States (zoom).svg", "Georgia in United States.svg", "Map of USA GA.svg"],
    "hawaii":         ["Hawaii in United States (zoom).svg", "Hawaii in United States.svg", "Map of USA HI.svg"],
    "idaho":          ["Idaho in United States (zoom).svg", "Idaho in United States.svg", "Map of USA ID.svg"],
    "illinois":       ["Illinois in United States (zoom).svg", "Illinois in United States.svg", "Map of USA IL.svg"],
    "indiana":        ["Indiana in United States (zoom).svg", "Indiana in United States.svg", "Map of USA IN.svg"],
    "iowa":           ["Iowa in United States (zoom).svg", "Iowa in United States.svg", "Map of USA IA.svg"],
    "kansas":         ["Kansas in United States (zoom).svg", "Kansas in United States.svg", "Map of USA KS.svg"],
    "kentucky":       ["Kentucky in United States (zoom).svg", "Kentucky in United States.svg", "Map of USA KY.svg"],
    "louisiana":      ["Louisiana in United States (zoom).svg", "Louisiana in United States.svg", "Map of USA LA.svg"],
    "maine":          ["Maine in United States (zoom).svg", "Maine in United States.svg", "Map of USA ME.svg"],
    "maryland":       ["Maryland in United States (zoom).svg", "Maryland in United States.svg", "Map of USA MD.svg"],
    "michigan":       ["Michigan in United States (zoom).svg", "Michigan in United States.svg", "Map of USA MI.svg"],
    "minnesota":      ["Minnesota in United States (zoom).svg", "Minnesota in United States.svg", "Map of USA MN.svg"],
    "mississippi":    ["Mississippi in United States (zoom).svg", "Mississippi in United States.svg", "Map of USA MS.svg"],
    "missouri":       ["Missouri in United States (zoom).svg", "Missouri in United States.svg", "Map of USA MO.svg"],
    "montana":        ["Montana in United States (zoom).svg", "Montana in United States.svg", "Map of USA MT.svg"],
    "nebraska":       ["Nebraska in United States (zoom).svg", "Nebraska in United States.svg", "Map of USA NE.svg"],
    "nevada":         ["Nevada in United States (zoom).svg", "Nevada in United States.svg", "Map of USA NV.svg"],
    "new-mexico":     ["New Mexico in United States (zoom).svg", "New Mexico in United States.svg", "Map of USA NM.svg"],
    "new-york":       ["New York in United States (zoom).svg", "New York in United States.svg", "Map of USA NY.svg"],
    "north-carolina": ["North Carolina in United States (zoom).svg", "North Carolina in United States.svg", "Map of USA NC.svg"],
    "north-dakota":   ["North Dakota in United States (zoom).svg", "North Dakota in United States.svg", "Map of USA ND.svg"],
    "ohio":           ["Ohio in United States (zoom).svg", "Ohio in United States.svg", "Map of USA OH.svg"],
    "oklahoma":       ["Oklahoma in United States (zoom).svg", "Oklahoma in United States.svg", "Map of USA OK.svg"],
    "oregon":         ["Oregon in United States (zoom).svg", "Oregon in United States.svg", "Map of USA OR.svg"],
    "pennsylvania":   ["Pennsylvania in United States (zoom).svg", "Pennsylvania in United States.svg", "Map of USA PA.svg"],
    "south-carolina": ["South Carolina in United States (zoom).svg", "South Carolina in United States.svg", "Map of USA SC.svg"],
    "south-dakota":   ["South Dakota in United States (zoom).svg", "South Dakota in United States.svg", "Map of USA SD.svg"],
    "tennessee":      ["Tennessee in United States (zoom).svg", "Tennessee in United States.svg", "Map of USA TN.svg"],
    "texas":          ["Texas in United States (zoom).svg", "Texas in United States.svg", "Map of USA TX.svg"],
    "utah":           ["Utah in United States (zoom).svg", "Utah in United States.svg", "Map of USA UT.svg"],
    "virginia":       ["Virginia in United States (zoom).svg", "Virginia in United States.svg", "Map of USA VA.svg"],
    "washington":     ["Washington (state) in United States (zoom).svg", "Washington in United States (zoom).svg", "Washington in United States.svg", "Map of USA WA.svg"],
    "west-virginia":  ["West Virginia in United States (zoom).svg", "West Virginia in United States.svg", "Map of USA WV.svg"],
    "wisconsin":      ["Wisconsin in United States (zoom).svg", "Wisconsin in United States.svg", "Map of USA WI.svg"],
    "wyoming":        ["Wyoming in United States (zoom).svg", "Wyoming in United States.svg", "Map of USA WY.svg"],
    # Americas
    "canada":         ["Canada on the globe (Americas centered).svg", "Canada location map.svg", "LocationCanada.svg"],
    "mexico":         ["Mexico on the globe (Americas centered).svg", "Mexico location map.svg", "LocationMexico.svg"],
    # Europe
    "belarus":        ["Belarus in Europe (de-facto) (zoomed).svg", "Belarus in Europe.svg", "Belarus location map.svg"],
    "czech-republic": ["Czech Republic in Europe (zoomed).svg", "Czechia in Europe (zoomed).svg", "Czech Republic in Europe.svg", "Czech Republic location map.svg"],
    "finland":        ["Finland in Europe (zoomed).svg", "Finland in Europe.svg", "Finland location map.svg"],
    "luxembourg":     ["Luxembourg in Europe (zoomed).svg", "Luxembourg in Europe.svg", "Luxembourg location map.svg"],
    "norway":         ["Norway in Europe (zoomed).svg", "Norway in Europe (de-facto) (zoomed).svg", "Norway in Europe.svg", "Norway location map.svg"],
    "poland":         ["Poland in Europe (zoomed).svg", "Poland in Europe.svg", "Poland location map.svg"],
    "romania":        ["Romania in Europe (zoomed).svg", "Romania in Europe.svg", "Romania location map.svg"],
    "russia":         ["Russia in the world (W3).svg", "Russia in Europe (zoomed).svg", "Russia location map.svg"],
    "sweden":         ["Sweden in Europe (zoomed).svg", "Sweden in Europe.svg", "Sweden location map.svg"],
    "ukraine":        ["Ukraine in Europe (zoomed).svg", "Ukraine in Europe (de-facto) (zoomed).svg", "Ukraine in Europe.svg", "Ukraine location map.svg"],
    # Africa
    "algeria":        ["Algeria in Africa.svg", "Algeria location map.svg"],
    "angola":         ["Angola in Africa.svg", "Angola location map.svg"],
    "dem-rep-of-the-congo": ["Democratic Republic of the Congo in Africa.svg", "DR Congo in Africa.svg", "Democratic Republic of Congo location map.svg"],
    "egypt":          ["Egypt in Africa.svg", "Egypt location map.svg"],
    "ethiopia":       ["Ethiopia in Africa.svg", "Ethiopia location map.svg"],
    "kenya":          ["Kenya in Africa.svg", "Kenya location map.svg"],
    "madagascar":     ["Madagascar in Africa.svg", "Madagascar location map.svg"],
    "mali":           ["Mali in Africa.svg", "Mali location map.svg"],
    "mozambique":     ["Mozambique in Africa.svg", "Mozambique location map.svg"],
    "nigeria":        ["Nigeria in Africa.svg", "Nigeria location map.svg"],
    "somalia":        ["Somalia in Africa.svg", "Somalia location map.svg"],
    "south-africa":   ["South Africa in Africa.svg", "South Africa location map.svg"],
    "sudan":          ["Sudan in Africa.svg", "Sudan location map.svg"],
    "tanzania":       ["Tanzania in Africa.svg", "Tanzania location map.svg"],
    "uganda":         ["Uganda in Africa.svg", "Uganda location map.svg"],
    "zambia":         ["Zambia in Africa.svg", "Zambia location map.svg"],
    "zimbabwe":       ["Zimbabwe in Africa.svg", "Zimbabwe location map.svg"],
    # Middle East / Central Asia
    "azerbaijan":     ["Azerbaijan in its region.svg", "Azerbaijan location map.svg"],
    "kazakhstan":     ["Kazakhstan in its region.svg", "Kazakhstan location map.svg"],
    "saudi-arabia":   ["Saudi Arabia in its region.svg", "Saudi Arabia location map.svg"],
    "turkey":         ["Turkey in its region.svg", "Turkey location map.svg"],
    "uzbekistan":     ["Uzbekistan in its region.svg", "Uzbekistan location map.svg"],
    # Asia-Pacific
    "australia":      ["Australia in Oceania (zoom) (W3).svg", "Australia in Oceania.svg", "Australia location map.svg"],
    "china":          ["China in Asia (de-facto).svg", "China in East Asia.svg", "China location map.svg"],
    "india":          ["India in Asia.svg", "India location map.svg"],
    "japan":          ["Japan in Asia.svg", "Japan location map.svg"],
    "mongolia":       ["Mongolia in Asia.svg", "Mongolia location map.svg"],
    "new-zealand":    ["New Zealand in Oceania (zoom).svg", "New Zealand in Oceania.svg", "New Zealand location map.svg"],
}


def batch_query(filenames):
    """Query up to 50 File: titles at once. Returns {filename: url} for hits."""
    titles = "|".join(f"File:{f}" for f in filenames)
    params = urllib.parse.urlencode({
        "action": "query",
        "titles": titles,
        "prop": "imageinfo",
        "iiprop": "url",
        "format": "json",
    })
    url = f"{API}?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": "TriviaMapsBot/1.0 (trivia project)"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())

    result = {}
    for page in data["query"]["pages"].values():
        if page.get("pageid", -1) != -1:
            imageinfo = page.get("imageinfo", [])
            if imageinfo:
                # page title is "File:XXX", strip prefix
                fname = page["title"][5:]
                result[fname] = imageinfo[0]["url"]
    return result


def chunks(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]


# Collect all unique candidate filenames
all_candidates = []
seen = set()
for candidates in LOCATIONS.values():
    for c in candidates:
        if c not in seen:
            all_candidates.append(c)
            seen.add(c)

print(f"Total unique candidate filenames: {len(all_candidates)}")

# Batch query in groups of 50
resolved = {}  # filename -> url
for i, batch in enumerate(chunks(all_candidates, 50)):
    print(f"Batch {i+1}: querying {len(batch)} files...")
    attempt = 0
    while attempt < 5:
        try:
            hits = batch_query(batch)
            resolved.update(hits)
            print(f"  -> {len(hits)} hits")
            break
        except Exception as e:
            attempt += 1
            wait = 2 ** attempt
            print(f"  ERR (attempt {attempt}): {e} — retrying in {wait}s")
            time.sleep(wait)
    time.sleep(1.5)

# Now pick best candidate per location
results = {}
failures = []

for slug, candidates in LOCATIONS.items():
    found = None
    for c in candidates:
        if c in resolved:
            found = resolved[c]
            print(f"  OK  {slug}: {c}")
            break
    if found:
        results[slug] = found
    else:
        failures.append(slug)
        print(f"  FAIL {slug}: tried {candidates}")

print("\n--- RESULTS JSON ---")
print(json.dumps(results, indent=2))

print(f"\n--- FAILURES ({len(failures)}) ---")
for f in failures:
    print(f"  {f}")
