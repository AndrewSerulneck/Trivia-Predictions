# Live Trivia Subcategory Proposal

> **Proposal only — no existing Live Categories files were modified.**
>
> This document proposes dividing each of the 8 existing Live Trivia categories into 5 subcategories each, based on two axes:
> 1. **Question phrasing patterns** (how questions are formulated)
> 2. **Sub-topic groupings** (what the question is actually about)

---

## Methodology

Each of the 8 category JSON files was analyzed across its full scope (first 50, middle 50, and last 50 questions per file) to identify:

- **Phrasing patterns**: The grammatical structure of question openings (What/Who/Which identification questions, "In" location-scoped questions, "Name the..." prompts, "Complete this..." lyric fill-ins, "Which [person] holds the record for..." record-stat questions, etc.)
- **Sub-topic clusters**: Natural groupings of question content (e.g., within History: wars/battles, US government, famous quotes, ancient civilizations, etc.)

The proposed subcategories below are designed to be **mutually exclusive** and **collectively exhaustive** — every question in each file can cleanly map to exactly one of the 5 proposed subcategories.

---

## 1. Movies (movies.json) — 465 questions

### Phrasing Profile
| Pattern | Count | % |
|---------|-------|---|
| Name-the-entity | 129 | 27.7% |
| Who-questions | 119 | 25.6% |
| Which-questions | 105 | 22.6% |
| What-questions | 67 | 14.4% |
| "In [film]" scoped | 37 | 8.0% |
| Other | 7 | 1.5% |

### Proposed 5 Subcategories

| # | Subcategory | Phrasing Pattern | Sub-Topics | Sample Questions |
|---|-------------|------------------|------------|-----------------|
| 1 | **Characters & Lore** | "What is the name of...", "What is the fictional..." | Character names, fictional objects/weapons, fictional locations, iconic items (Nakatomi Plaza, Infinity Stones, T-800, Nimbus 2000, lightsabers, etc.) | "What is the name of the fictional LA skyscraper where John McClane fights terrorists?" |
| 2 | **Actors & Performers** | "Which actor played...", "Who played...", "Who directed..." | Actor-role associations, biopic casting, directors, voice actors | "Which actor won a posthumous Oscar for his portrayal of The Joker?" |
| 3 | **Plot, Quotes & Trivia** | "In what movie does...", "What movie starts with...", fill-in-the-blank quotes | Opening lines, famous quotes, plot details, franchise lore, "Name that movie" | "In what movie does the opening line read: 'A long time ago in a galaxy far, far away...'?" |
| 4 | **Biographical Films** | "Which [real person] was played by [actor] in the film..." | Historical/biographical figure portrayals, real events adapted to film | "Which tech entrepreneur was played by Jesse Eisenberg in The Social Network?" |
| 5 | **Awards, History & Industry** | "Which film won...", "Who directed...", "What year..." | Oscar winners, box office records, franchise origins, film history/dates | "Which film won the first Academy Award for Best Picture?" |

---

## 2. Science & Tech (science.v1.json) — 261 questions

### Phrasing Profile
| Pattern | Count | % |
|---------|-------|---|
| What-questions | 173 | 66.3% |
| Which-questions | 46 | 17.6% |
| Other | 17 | 6.5% |
| "In" scoped | 12 | 4.6% |
| How-questions | 10 | 3.8% |
| Who-questions | 3 | 1.1% |

### Proposed 5 Subcategories

| # | Subcategory | Phrasing Pattern | Sub-Topics | Sample Questions |
|---|-------------|------------------|------------|-----------------|
| 1 | **Chemistry & The Periodic Table** | "What is the chemical symbol for...", "What is the chemical formula...", "Which element..." | Element symbols, chemical formulas, periodic table facts, compounds | "What is the chemical symbol for Gold?", "What is the chemical formula for water?" |
| 2 | **Biology & The Human Body** | "How many bones...", "Which organelle...", "What is the name of..." | Anatomy, cells, DNA, human body systems, diseases, medicine | "How many bones are in the adult human body?", "Which organelle is the powerhouse of the cell?" |
| 3 | **Physics & Scientific Concepts** | "What is the bending of light...", "Newton's Second Law...", "What scientific term..." | Laws of motion, energy, forces, waves, light/sound, units of measure | "What is the bending of light as it passes from one medium to another called?" |
| 4 | **Astronomy & Earth Science** | "Which planet...", "What is the name of the galaxy...", "What layer of Earth..." | Planets, solar system, galaxies, stars, geology, atmosphere, weather | "Which planet is known as the Red Planet?", "What is the lowest layer of Earth's atmosphere?" |
| 5 | **Medicine, Technology & Applied Science** | "What does the abbreviation...", "What medical term...", "What invention..." | Diseases, medical terminology, inventions, pharmaceuticals, technology | "What does the abbreviation 'ICU' stand for?", "What brand-name medication was the first SSRI?" |

---

## 3. Sports (sports.v1.json) — 231 questions

### Phrasing Profile
| Pattern | Count | % |
|---------|-------|---|
| Which-questions | 61 | 26.4% |
| Name-the-team | 61 | 26.4% |
| Other | 41 | 17.7% |
| Who-questions | 26 | 11.3% |
| What-questions | 18 | 7.8% |
| "In" scoped | 13 | 5.6% |
| How-questions | 5 | 2.2% |
| When-questions | 4 | 1.7% |

### Proposed 5 Subcategories

| # | Subcategory | Phrasing Pattern | Sub-Topics | Sample Questions |
|---|-------------|------------------|------------|-----------------|
| 1 | **Records & Statistics** | "Who holds the record for...", "Which player has the most...", "Which team has the most..." | Single-season records, career records, championship counts | "Who is the NBA's all-time leading scorer?", "Which MLB team has won the most World Series?" |
| 2 | **Teams & Franchises** | "Name the professional [sport] team from [city].", "Which team did [player] win championships with?" | Team-city associations, athlete-team pairings, franchise history/relocation | "Name the professional basketball team from Philadelphia.", "Which team did Michael Jordan win 6 NBA championships with?" |
| 3 | **Historical Moments** | "Which team overcame...", "Who won the...", "Which school has the most..." | Iconic games/matches, tournament winners, championship history, Olympic history | "Which team overcame a 28-3 deficit to win Super Bowl LI?" |
| 4 | **Rules & Terminology** | "How many players...", "In what sport...", "What is the term for..." | Scoring rules, positions, equipment, gameplay mechanics | "How many players are on a standard soccer team on the field?", "What is the term for three strokes under par?" |
| 5 | **Notable Figures & Legends** | "Who is the only tennis player to...", "Which boxer...", "Which NBA legend..." | Iconic athletes, coaches, pioneers who broke barriers, personality nicknames | "Who was the first player to be voted unanimous NBA MVP?" |

---

## 4. History & Government (history.v1.json) — 494 questions

### Phrasing Profile
| Pattern | Count | % |
|---------|-------|---|
| What-questions | 190 | 38.5% |
| Who-questions | 98 | 19.8% |
| Which-questions | 84 | 17.0% |
| "In what year..." | 46 | 9.3% |
| Other | 30 | 6.1% |
| Yes/No (Is/Was) | 28 | 5.7% |
| How-questions | 14 | 2.8% |
| Name-questions | 3 | 0.6% |

### Proposed 5 Subcategories

| # | Subcategory | Phrasing Pattern | Sub-Topics | Sample Questions |
|---|-------------|------------------|------------|-----------------|
| 1 | **Ancient & Medieval History** | "Who was the first...", "Which civilization...", "In what year..." | Ancient civilizations (Rome, Greece, Egypt, Mesopotamia), medieval rulers, empires, early events | "Who was the first official emperor of the Roman Empire?", "In what year was the Magna Carta signed?" |
| 2 | **Wars, Battles & Conflicts** | "Which battle...", "What war...", "The assassination of which figure..." | Major wars (WWI, WWII, Civil War, Cold War), specific battles, causes/consequences | "The storming of which prison signaled the start of the French Revolution?" |
| 3 | **US History & Government** | "Which amendment...", "What article of the Constitution...", "Which US President..." | Constitutional amendments, presidents, branches of government, founding documents | "Which amendment to the US Constitution granted women the right to vote?" |
| 4 | **Famous Figures & Quotes** | "Who famously said...", "Which [leader/philosopher]...", "Which activist..." | Notable historical figures, famous quotations, civil rights leaders, scientists/explorers | "Which Indian independence leader is credited with 'Be the change you wish to see in the world'?" |
| 5 | **Cultural & Social History** | "What event...", "In which country did...", "What cultural movement..." | Revolutions, social movements, inventions/discoveries, treaties, economic conditions | "In which city did the Renaissance begin?", "What economic condition of the 1970s combined stagnation with inflation?" |

---

## 5. Music (music.v1.json) — 316 questions

### Phrasing Profile
| Pattern | Count | % |
|---------|-------|---|
| Name-the-band | 96 | 30.4% |
| Complete-the-lyric | 63 | 19.9% |
| Which-questions | 44 | 13.9% |
| Other | 41 | 13.0% |
| What-questions | 29 | 9.2% |
| Who-questions | 21 | 6.6% |
| "In" scoped | 20 | 6.3% |
| How/When | 2 | 0.6% |

### Proposed 5 Subcategories

| # | Subcategory | Phrasing Pattern | Sub-Topics | Sample Questions |
|---|-------------|------------------|------------|-----------------|
| 1 | **Artists & Bands** | "Which artist...", "Who is the lead singer...", "Name the rock band that consists of..." | Artist identification, band membership/lineups, solo artist origins | "Which artist is widely known as the 'King of Pop'?", "Name the rock band that consists of Kurt Cobain, Krist Novoselic, and Dave Grohl." |
| 2 | **Albums, Songs & Lyrics** | "Complete this [artist] lyric...", "Which album...", "What was the title of..." | Song titles, lyrics completion, album names, album covers, songwriting credits | "Complete this lyric from 'Bohemian Rhapsody': 'Is this the real life? Is this just ___'?", "Which Pink Floyd album features a prism on the cover?" |
| 3 | **Music History & Events** | "In which year...", "What year was...", "Which festival..." | Release dates, Woodstock, album milestones, award history | "In which year did the original Woodstock festival take place?" |
| 4 | **Genres, Instruments & Terminology** | "What musical genre...", "What instrument...", "What is the term for..." | Music genres (jazz, rock, hip-hop), instruments, vocal ranges, music theory | "What musical genre originated in New Orleans?", "What is the smallest interval in Western tonal music?" |
| 5 | **Contemporary & Pop Culture** | "Which pop star...", "What artist broke records with...", "Which K-Pop group..." | Modern artists, recent hits, streaming records, pop culture phenomena | "What artist broke multiple records with her 'Eras Tour' in 2023-2024?" |

---

## 6. Geography (geography.v1.json) — 561 questions

### Phrasing Profile
| Pattern | Count | % |
|---------|-------|---|
| Which-questions | 308 | 54.9% |
| Other (landmark descriptions) | 178 | 31.7% |
| What-questions | 66 | 11.8% |
| "In" scoped | 6 | 1.1% |
| Other | 3 | 0.5% |

### Proposed 5 Subcategories

| # | Subcategory | Phrasing Pattern | Sub-Topics | Sample Questions |
|---|-------------|------------------|------------|-----------------|
| 1 | **Countries, Capitals & Borders** | "What is the capital of...", "Which country...", "[Country] borders..." | Capital cities, country locations, borders, territories | "What is the capital city of Australia?", "Monaco is bordered on three sides by which country?" |
| 2 | **Landmarks & Wonders** | "Constructed as...", "Designed by...", "Located in..." (narrative description) | Natural wonders (mountains, rivers, deserts), man-made landmarks (Eiffel Tower, Taj Mahal, Machu Picchu) | "Constructed as the grand entrance arch for the 1889 World's Fair, this towering iron lattice tower is in which city?" |
| 3 | **Physical Geography** | "Which ocean...", "Which river...", "What is the highest/lowest/largest..." | Oceans, seas, rivers, mountains, deserts, lakes, climate zones | "Which river is generally considered the longest in the world?", "Which mountain is the highest above sea level?" |
| 4 | **Map Identification** | "Which country is shown highlighted on this map?" (image-based) | Silhouette/outline identification via map images, `imageUrl` questions | "Which country is shown highlighted on this map?" (accompanied by map image) |
| 5 | **US States & Quirky Facts** | "Which [region] state...", "In which US state..." | State capitals, state mottos/seals, strange laws, unique geographical features of US states | "Which western state uses the motto 'By and by' on its state seal?", "The Grand Canyon is located in which U.S. state?" |

---

## 7. Art, Literature & Comics (art-literature.json) — 303 questions

### Phrasing Profile
| Pattern | Count | % |
|---------|-------|---|
| What-questions | 187 | 61.7% |
| Which-questions | 93 | 30.7% |
| "In" scoped | 8 | 2.6% |
| Who-questions | 8 | 2.6% |
| Other | 7 | 2.3% |

### Proposed 5 Subcategories

| # | Subcategory | Phrasing Pattern | Sub-Topics | Sample Questions |
|---|-------------|------------------|------------|-----------------|
| 1 | **Language & Grammar** | "What part of speech...", "What is the term for...", "What do you call..." | Parts of speech, literary devices (metaphor, simile, alliteration), punctuation, word types | "What is the term for a figure of speech that pairs two seemingly contradictory terms?" |
| 2 | **Classic Literature** | "Which author wrote...", "What [year] novel by [author]...", "In what book does the opening line read..." | Novels, authors, opening lines, plot summaries, literary periods | "Which author wrote 'Romeo and Juliet'?", "What novel begins with 'Call me Ishmael'?" |
| 3 | **Art History & Artists** | "Which artist painted...", "Which artist sculpted...", "What historical figure is depicted..." | Famous paintings, sculptors, art movements, street art, artist identification | "Which artist painted 'The Starry Night'?", "Which anonymous British street artist created 'Girl with Balloon'?" |
| 4 | **Comics & Graphic Novels** | "Which superhero...", "What landmark comic series...", "The launch of which superhero team..." | Comic book characters (Marvel, DC), graphic novels, comic history | "What landmark 1986 deconstructive comic series by Alan Moore is the only graphic novel on Time's Top 100?" |
| 5 | **Adaptations & Theater** | "What [author] novel was adapted into...", "What Broadway musical..." | Book-to-film adaptations, musicals, plays | "What Mario Puzo novel about an American crime family was adapted into a 1972 film?", "What 2015 Broadway musical by Lin-Manuel Miranda uses hip-hop to tell the story of Alexander Hamilton?" |

---

## 8. Television (television.json) — 314 questions

### Phrasing Profile
| Pattern | Count | % |
|---------|-------|---|
| Other (show-scoped trivia) | 196 | 62.4% |
| "In/On [show]..." | 62 | 19.7% |
| What-questions | 29 | 9.2% |
| Which-questions | 9 | 2.9% |
| Who-questions | 8 | 2.5% |
| When-questions | 4 | 1.3% |
| Other | 6 | 1.9% |

### Proposed 5 Subcategories

| # | Subcategory | Phrasing Pattern | Sub-Topics | Sample Questions |
|---|-------------|------------------|------------|-----------------|
| 1 | **Sitcoms & Comedy** | "In [show]...", "On [show]...", "What is the name of..." | Sitcom trivia (The Office, Friends, Seinfeld, HIMYM, Parks & Rec, Modern Family, Always Sunny, Community, New Girl, etc.) | "In How I Met Your Mother, what is the name of Barney's legendary dating notebook?" |
| 2 | **Drama & Premium Cable** | "In [show]...", "On [show]...", "What is the name of the..." | Drama series (Breaking Bad, Game of Thrones, Sopranos, Better Call Saul, The Wire, Succession, The Crown, Yellowjackets, etc.) | "On Breaking Bad, what is the name of Gus Fring's fast-food chicken franchise?" |
| 3 | **Animated Series** | "On [show]...", "What is the name of the..." | Cartoons (Simpsons, SpongeBob, South Park, Family Guy, Bob's Burgers, Scooby-Doo, Rick & Morty, etc.) | "On The Simpsons, what is the brand name of Homer's favorite beer?" |
| 4 | **Reality & Competition** | "Who was the winner of...", "Which Real Housewives franchise..." | Reality TV (Vanderpump Rules, RuPaul's Drag Race, Real Housewives, Survivor, etc.), game shows | "Who was the winner of the very first season of RuPaul's Drag Race?" |
| 5 | **SNL, Late Night & Recent Series** | "Which SNL alumni...", "Chris Farley routinely...", "In the TV show 'Severance'..." | Saturday Night Live history and sketches, recent acclaimed series (2020s), streaming originals | "Which SNL alumni voiced the villain in 'Despicable Me 4'?", "What company do the employees in Severance work for?" |

---

## Implementation Approach

If you wanted to implement these subcategories, here is how I would approach it:

## Implementation Approaches — Pros & Cons

### Option A: Flat `subcategory` field on each question

Add a `subcategory` string property to each question object:

```json
{
  "slug": "action-movie-nakatomi-plaza",
  "question": "What is the name of the fictional Los Angeles skyscraper...",
  "answer": "Nakatomi Plaza",
  "category": "movies",
  "difficulty": "easy",
  "subcategory": "characters-and-lore"
}
```

**Pros:** Minimal structural change — just one new field per question; no refactoring needed for any code that reads or displays questions since the flat array stays intact, and you can filter by subcategory with a simple `.filter()`.

**Cons:** The flat array still requires scanning all questions to get a subcategory's subset (no structural grouping), and if you wanted to do subcategory-aware shuffling or weighted selection, you'd need to group them at query time rather than having them pre-organized.

### Option B: Nested `questions` by subcategory

Restructure each JSON file so questions are organized by subcategory:

```json
{
  "categoryName": "Movies",
  "subcategories": {
    "characters-and-lore": { "name": "Characters & Lore", "questions": [...] },
    "actors-and-performers": { "name": "Actors & Performers", "questions": [...] }
  }
}
```

**Pros:** Questions are physically grouped by subcategory, making subcategory-weighted selection trivial (pick a subcategory, then pick from its questions), and the structure is self-documenting — you can see at a glance how many questions exist per subcategory.

**Cons:** Any code that iterates all questions (e.g., shuffling the full pool, counting total questions) now needs to flatten the nested structure first, and the JSON files become slightly larger due to the extra nesting keys for each subcategory wrapper.

### Option C: Separate files per subcategory

Split each category into 5 individual files:

```
data/live-trivia/categories/movies/
  characters-and-lore.json
  actors-and-performers.json
  plot-quotes-and-trivia.json
  biographical-films.json
  awards-history-and-industry.json
```

**Pros:** Maximum modularity — each subcategory is independently loadable, cacheable, and deployable, so you could lazily load only the subcategories needed for a given round, reducing initial payload.

**Cons:** Significantly more files to manage (40 files instead of 8), import paths become more complex for the loading logic, and any cross-subcategory operations (like a "mixed" round) require merging multiple files at runtime, adding latency and complexity.

### Automation Strategy

A Python script could:
1. Load each category JSON file
2. For each question, analyze the `question` text for:
   - Starting words/phrases (grammatical pattern matching)
   - Keywords matching known sub-topics (e.g., "painted" → Art, "chemical symbol" → Chemistry)
   - For Music: presence of "Complete this" → Lyrics; "consists of" → Band lineups
   - For Geography: presence of `imageUrl` → Map Identification
   - For Sports: "holds the record" → Records; "Name the professional" → Teams
3. Assign the most likely subcategory
4. Validate with a confidence threshold — flag edge cases for manual review

The accuracy would be very high (estimated 90-95%) because the phrasing patterns are highly consistent within each subcategory cluster.
