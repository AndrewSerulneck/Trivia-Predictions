#!/usr/bin/env python3
"""
Apply Wikimedia URLs to geography.v1.json:
- Replace imageUrl + imageCredit for 82 locations
- Remove the Moldova question entirely
"""

import json

WIKIMEDIA_URLS = {
  "alaska": "https://upload.wikimedia.org/wikipedia/commons/b/b2/Alaska_in_United_States.svg",
  "arizona": "https://upload.wikimedia.org/wikipedia/commons/d/d8/Arizona_in_United_States.svg",
  "arkansas": "https://upload.wikimedia.org/wikipedia/commons/8/86/Arkansas_in_United_States.svg",
  "california": "https://upload.wikimedia.org/wikipedia/commons/9/94/California_in_United_States.svg",
  "colorado": "https://upload.wikimedia.org/wikipedia/commons/6/60/Colorado_in_United_States.svg",
  "florida": "https://upload.wikimedia.org/wikipedia/commons/1/15/Florida_in_United_States.svg",
  "georgia": "https://upload.wikimedia.org/wikipedia/commons/d/d1/Georgia_in_United_States.svg",
  "hawaii": "https://upload.wikimedia.org/wikipedia/commons/7/7e/Hawaii_in_United_States_%28zoom%29.svg",
  "idaho": "https://upload.wikimedia.org/wikipedia/commons/a/a0/Idaho_in_United_States.svg",
  "illinois": "https://upload.wikimedia.org/wikipedia/commons/5/53/Illinois_in_United_States.svg",
  "indiana": "https://upload.wikimedia.org/wikipedia/commons/d/d2/Indiana_in_United_States.svg",
  "iowa": "https://upload.wikimedia.org/wikipedia/commons/5/57/Iowa_in_United_States.svg",
  "kansas": "https://upload.wikimedia.org/wikipedia/commons/a/a6/Kansas_in_United_States.svg",
  "kentucky": "https://upload.wikimedia.org/wikipedia/commons/e/e2/Kentucky_in_United_States.svg",
  "louisiana": "https://upload.wikimedia.org/wikipedia/commons/2/2a/Louisiana_in_United_States.svg",
  "maine": "https://upload.wikimedia.org/wikipedia/commons/7/78/Maine_in_United_States.svg",
  "maryland": "https://upload.wikimedia.org/wikipedia/commons/d/da/Maryland_in_United_States_%28zoom%29.svg",
  "michigan": "https://upload.wikimedia.org/wikipedia/commons/5/50/Michigan_in_United_States.svg",
  "minnesota": "https://upload.wikimedia.org/wikipedia/commons/8/81/Minnesota_in_United_States.svg",
  "mississippi": "https://upload.wikimedia.org/wikipedia/commons/2/22/Mississippi_in_United_States.svg",
  "missouri": "https://upload.wikimedia.org/wikipedia/commons/6/62/Missouri_in_United_States.svg",
  "montana": "https://upload.wikimedia.org/wikipedia/commons/6/67/Montana_in_United_States.svg",
  "nebraska": "https://upload.wikimedia.org/wikipedia/commons/4/44/Nebraska_in_United_States.svg",
  "nevada": "https://upload.wikimedia.org/wikipedia/commons/b/ba/Nevada_in_United_States.svg",
  "new-mexico": "https://upload.wikimedia.org/wikipedia/commons/f/fe/New_Mexico_in_United_States.svg",
  "new-york": "https://upload.wikimedia.org/wikipedia/commons/0/06/New_York_in_United_States.svg",
  "north-carolina": "https://upload.wikimedia.org/wikipedia/commons/2/20/North_Carolina_in_United_States.svg",
  "north-dakota": "https://upload.wikimedia.org/wikipedia/commons/b/bc/North_Dakota_in_United_States.svg",
  "ohio": "https://upload.wikimedia.org/wikipedia/commons/5/58/Ohio_in_United_States.svg",
  "oklahoma": "https://upload.wikimedia.org/wikipedia/commons/9/99/Oklahoma_in_United_States.svg",
  "oregon": "https://upload.wikimedia.org/wikipedia/commons/5/59/Oregon_in_United_States.svg",
  "pennsylvania": "https://upload.wikimedia.org/wikipedia/commons/6/6d/Pennsylvania_in_United_States.svg",
  "south-carolina": "https://upload.wikimedia.org/wikipedia/commons/8/8e/South_Carolina_in_United_States.svg",
  "south-dakota": "https://upload.wikimedia.org/wikipedia/commons/8/8f/South_Dakota_in_United_States.svg",
  "tennessee": "https://upload.wikimedia.org/wikipedia/commons/2/29/Tennessee_in_United_States.svg",
  "texas": "https://upload.wikimedia.org/wikipedia/commons/a/ad/Texas_in_United_States.svg",
  "utah": "https://upload.wikimedia.org/wikipedia/commons/8/82/Utah_in_United_States.svg",
  "virginia": "https://upload.wikimedia.org/wikipedia/commons/c/c6/Virginia_in_United_States.svg",
  "washington": "https://upload.wikimedia.org/wikipedia/commons/3/30/Washington_in_United_States.svg",
  "west-virginia": "https://upload.wikimedia.org/wikipedia/commons/2/2a/West_Virginia_in_United_States.svg",
  "wisconsin": "https://upload.wikimedia.org/wikipedia/commons/a/a7/Wisconsin_in_United_States.svg",
  "wyoming": "https://upload.wikimedia.org/wikipedia/commons/5/5b/Wyoming_in_United_States.svg",
  "canada": "https://upload.wikimedia.org/wikipedia/commons/1/15/Canada_location_map.svg",
  "mexico": "https://upload.wikimedia.org/wikipedia/commons/e/e4/Mexico_on_the_globe_%28Americas_centered%29.svg",
  "belarus": "https://upload.wikimedia.org/wikipedia/commons/2/2b/Belarus_in_Europe.svg",
  "czech-republic": "https://upload.wikimedia.org/wikipedia/commons/f/ff/Czech_Republic_in_Europe.svg",
  "finland": "https://upload.wikimedia.org/wikipedia/commons/9/9e/Finland_in_Europe.svg",
  "luxembourg": "https://upload.wikimedia.org/wikipedia/commons/e/eb/Luxembourg_in_Europe.svg",
  "norway": "https://upload.wikimedia.org/wikipedia/commons/6/6e/Norway_in_Europe.svg",
  "poland": "https://upload.wikimedia.org/wikipedia/commons/b/bd/Poland_in_Europe.svg",
  "romania": "https://upload.wikimedia.org/wikipedia/commons/a/af/Romania_in_Europe.svg",
  "russia": "https://upload.wikimedia.org/wikipedia/commons/9/96/Russia_location_map.svg",
  "sweden": "https://upload.wikimedia.org/wikipedia/commons/a/a2/Sweden_in_Europe.svg",
  "ukraine": "https://upload.wikimedia.org/wikipedia/commons/2/27/Ukraine_in_Europe.svg",
  "algeria": "https://upload.wikimedia.org/wikipedia/commons/f/f2/Algeria_in_Africa.svg",
  "angola": "https://upload.wikimedia.org/wikipedia/commons/8/8d/Angola_in_Africa.svg",
  "dem-rep-of-the-congo": "https://upload.wikimedia.org/wikipedia/commons/0/0e/Democratic_Republic_of_the_Congo_in_Africa.svg",
  "egypt": "https://upload.wikimedia.org/wikipedia/commons/c/c8/Egypt_location_map.svg",
  "ethiopia": "https://upload.wikimedia.org/wikipedia/commons/f/f0/Ethiopia_in_Africa.svg",
  "kenya": "https://upload.wikimedia.org/wikipedia/commons/2/2c/Kenya_location_map.svg",
  "madagascar": "https://upload.wikimedia.org/wikipedia/commons/b/ba/Madagascar_in_Africa.svg",
  "mali": "https://upload.wikimedia.org/wikipedia/commons/5/5e/Mali_in_Africa.svg",
  "mozambique": "https://upload.wikimedia.org/wikipedia/commons/0/05/Mozambique_in_Africa.svg",
  "nigeria": "https://upload.wikimedia.org/wikipedia/commons/7/70/Nigeria_in_Africa.svg",
  "somalia": "https://upload.wikimedia.org/wikipedia/commons/6/65/Somalia_in_Africa.svg",
  "south-africa": "https://upload.wikimedia.org/wikipedia/commons/3/3c/South_Africa_in_Africa.svg",
  "sudan": "https://upload.wikimedia.org/wikipedia/commons/3/3d/Sudan_location_map.svg",
  "tanzania": "https://upload.wikimedia.org/wikipedia/commons/8/83/Tanzania_in_Africa.svg",
  "uganda": "https://upload.wikimedia.org/wikipedia/commons/5/5d/Uganda_in_Africa.svg",
  "zambia": "https://upload.wikimedia.org/wikipedia/commons/e/eb/Zambia_in_Africa.svg",
  "zimbabwe": "https://upload.wikimedia.org/wikipedia/commons/6/69/Zimbabwe_in_Africa.svg",
  "azerbaijan": "https://upload.wikimedia.org/wikipedia/commons/1/1a/Azerbaijan_in_its_region.svg",
  "kazakhstan": "https://upload.wikimedia.org/wikipedia/commons/f/ff/Kazakhstan_in_its_region.svg",
  "saudi-arabia": "https://upload.wikimedia.org/wikipedia/commons/7/79/Saudi_Arabia_in_its_region.svg",
  "turkey": "https://upload.wikimedia.org/wikipedia/commons/3/30/Turkey_in_its_region.svg",
  "uzbekistan": "https://upload.wikimedia.org/wikipedia/commons/1/1d/Uzbekistan_in_its_region.svg",
  "australia": "https://upload.wikimedia.org/wikipedia/commons/4/4b/Australia_in_Oceania.svg",
  "china": "https://upload.wikimedia.org/wikipedia/commons/9/96/China_in_Asia_%28de-facto%29.svg",
  "india": "https://upload.wikimedia.org/wikipedia/commons/d/dc/India_location_map.svg",
  "japan": "https://upload.wikimedia.org/wikipedia/commons/6/6e/Japan_location_map.svg",
  "mongolia": "https://upload.wikimedia.org/wikipedia/commons/c/c8/Mongolia_in_Asia.svg",
  "new-zealand": "https://upload.wikimedia.org/wikipedia/commons/e/e1/New_Zealand_in_Oceania.svg",
}

REMOVE_SLUG = "geography-map-moldova"

JSON_PATH = "data/live-trivia/categories/geography.v1.json"

with open(JSON_PATH) as f:
    data = json.load(f)

updated = 0
removed = 0
new_questions = []

for q in data["questions"]:
    slug = q.get("slug", "")

    # Remove Moldova
    if slug == REMOVE_SLUG:
        removed += 1
        print(f"  REMOVE: {slug}")
        continue

    # Check if this is a map question that needs replacing
    if slug.startswith("geography-map-"):
        location = slug[len("geography-map-"):]
        if location in WIKIMEDIA_URLS:
            q["imageUrl"] = WIKIMEDIA_URLS[location]
            q["imageCredit"] = "Map via Wikimedia Commons"
            updated += 1
            print(f"  UPDATE: {slug}")

    new_questions.append(q)

data["questions"] = new_questions

with open(JSON_PATH, "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")

print(f"\nDone: {updated} updated, {removed} removed, {len(new_questions)} questions remain.")
