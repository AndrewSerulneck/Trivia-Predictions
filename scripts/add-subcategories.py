#!/usr/bin/env python3
"""
Add subcategory field to each question in all 8 Live Trivia category files.

Usage: python3 scripts/add-subcategories.py

This script modifies each file in-place, adding a 'subcategory' string to each question.
Backups are created as *.bak files.
"""

import json
import os
import re
import shutil
from pathlib import Path

DATA_DIR = Path("data/live-trivia/categories")

# ============================================================
# Classification functions for each category
# ============================================================

def classify_movies(q_text, q_answer, q_slug):
    """Movies - 465 questions"""
    t = q_text.strip()
    
    # Biographical Films: "Which [real person] was played by [actor]..."
    if re.search(r'(was|were)\s+played\s+by\s+', t, re.I):
        return "biographical-films"
    
    # Awards, History & Industry: Oscar winners, firsts, records
    if re.search(r'(won|winning|Academy Award|Oscar|first\s+film|highest-grossing|box\s+office)', t, re.I):
        return "awards-history-industry"
    if re.search(r'^(Which|What)\s+(film|movie|animated)\s+(won|kicked\s+off|is\s+the)', t, re.I):
        return "awards-history-industry"
    if re.search(r'(directed|director)\s+(by|of)\s+', t, re.I) and not re.search(r'^(In|What)\s+(movie|film)', t, re.I):
        return "awards-history-industry"
    
    # Plot, Quotes & Trivia: Opening lines, "In what movie does...", "Name that movie..."
    if re.search(r'^(In|On)\s+(what|which)\s+(movie|film)\s+', t, re.I):
        return "plot-quotes-trivia"
    if re.search(r'^(In|On)\s+the\s+\d{4}\s+', t, re.I):
        return "plot-quotes-trivia"
    if re.search(r'^Name\s+that\s+movie', t, re.I):
        return "plot-quotes-trivia"
    if re.search(r'^(What|In\s+what)\s+movie\s+(starts|does|features|is|has)', t, re.I):
        return "plot-quotes-trivia"
    if re.search(r'opening\s+(line|monologue|line\s+read)', t, re.I):
        return "plot-quotes-trivia"
    if re.search(r'famous(ly)?\s+(said|remarked|observed|quipped|advised)', t, re.I):
        return "plot-quotes-trivia"  # quote identification
    
    # Characters & Lore: Fictional elements, objects, locations
    if re.search(r'(fictional|name of the|name is|known as|call sign|code name|alter ego)', t, re.I):
        return "characters-lore"
    if re.search(r'^(What|Which)\s+(is|was|color|name|type|specific|breed)', t, re.I):
        return "characters-lore"
    if re.search(r'What\s+(is|was)\s+the\s+(name|first\s+name|last\s+name|full\s+name|civilian)', t, re.I):
        return "characters-lore"
    if re.search(r'What\s+(is|was)\s+[a-z]+\s+(name|title|color|call\s+sign|secret\s+agent|specific)', t, re.I):
        return "characters-lore"
    
    # Actors & Performers (catch-all for remaining who/which actor questions)
    if re.search(r'^(Who|Which\s+actor|Which\s+actress|Which\s+performer)', t, re.I):
        return "actors-performers"
    
    # Default for anything that slipped through
    return "plot-quotes-trivia"


def classify_science(t, q_answer, q_slug):
    """Science & Tech - 261 questions"""
    
    # Chemistry & Periodic Table
    if re.search(r'(chemical\s+(symbol|formula|name|element)|periodic\s+table|symbol\s+for|atomic\s+(number|mass)|element|compound|molecule|acid|base\s+pH|pH\s+scale)', t, re.I):
        return "chemistry-periodic-table"
    if re.search(r'What\s+is\s+the\s+(chemical\s+)?(symbol|formula)', t, re.I):
        return "chemistry-periodic-table"
    if re.search(r'Which\s+(element|chemical|gas)\s+(is|has|represents)', t, re.I):
        return "chemistry-periodic-table"
    
    # Biology & Human Body
    if re.search(r'(bone|cell|DNA|organelle|mitochondria|chromosome|blood|heart|lung|brain|liver|kidney|muscle|skeleton|human\s+body|organism|species|bacteria|virus|protein|enzyme|hormone|gene|genetic)', t, re.I):
        return "biology-human-body"
    if re.search(r'How\s+many\s+(bones|chromosome|pair)', t, re.I):
        return "biology-human-body"
    
    # Medicine, Technology & Applied Science
    if re.search(r'(medical|disease|diagnosis|treatment|drug|medication|hospital|surgery|patient|doctor|nurse|clinic|pharmacy|prescription|therapy|vaccine|antibiotic|symptom|disorder|syndrome|infection)', t, re.I):
        return "medicine-technology"
    if re.search(r'(invent|discover|technology|computer|software|HTML|programming|algorithm|device|machine|engine|Patent|Gutenberg|printing\s+press)', t, re.I):
        return "medicine-technology"
    if re.search(r'(Viagra|Prozac|Lipitor|Crestor|EpiPen|Morphine|ICU|OTC|Rx|anemia|diabetes|tuberculosis|fungus|epidemiology|Hippocratic|Stockholm|triage|oncologist|scurvy|thyroid)', t, re.I):
        return "medicine-technology"
    
    # Physics & Scientific Concepts
    if re.search(r'(force|motion|energy|velocity|accelerat|inertia|gravity|friction|wave|light|sound|heat|temperature|electric|magnet|circuit|voltage|current|power|work|Newton|Einstein|law\s+of|theory\s+of\s+relativity|quantum|photon|electron|proton|neutron|atom|nucleus|refraction|frequency|hertz|watt|ohm|ampere|joule|kelvin)', t, re.I):
        return "physics-concepts"
    if re.search(r'(SI\s+unit|unit\s+of|standard\s+(scientific|SI)|scientific\s+(term|instrument|unit))', t, re.I):
        return "physics-concepts"
    
    # Astronomy & Earth Science
    if re.search(r'(planet|star|galaxy|solar\s+system|moon|asteroid|comet|orbit|sun|earth|mars|jupiter|saturn|venus|mercury|neptune|uranus|pluto|universe|cosmic|space|telescope|astronom)', t, re.I):
        return "astronomy-earth-science"
    if re.search(r'(geolog|volcano|earthquake|atmosphere|climate|weather|ocean\s+current|rock|mineral|fossil|erosion|continental|tectonic|sediment|magma|lava|crust|mantle|core\s+earth|meteorolog|barometer|seismograph)', t, re.I):
        return "astronomy-earth-science"
    
    # Default
    return "physics-concepts"


def classify_sports(t, q_answer, q_slug):
    """Sports - 231 questions"""
    
    # Teams & Franchises: "Name the professional [sport] team from [city]", relocation
    if re.search(r'^Name\s+the\s+professional\s+', t, re.I):
        return "teams-franchises"
    if re.search(r'(before\s+(moving|relocating)|originally\s+(earned|played|founded|known\s+as)|prior\s+to\s+relocating|originally\s+located)', t, re.I):
        return "teams-franchises"
    if re.search(r'^Which\s+team\s+did\s+', t, re.I) and re.search(r'(win|championship|title|ring|cup|trophy)', t, re.I):
        return "teams-franchises"  # "Which team did [player] win championships with?"
    
    # Records & Statistics
    if re.search(r'(holds?\s+the\s+record|all-time\s+(leading|leader)|most\s+(career|points|goals|wins|titles|championships|home\s+runs|yards|sacks|MVPs?|three-pointers)|silhouette\s+(is\s+featured|on\s+the\s+logo)|unanimous|first\s+player\s+to)', t, re.I):
        return "records-statistics"
    if re.search(r'(record\s+for|all-time\s+(scorer|leader)|highest\s+individual\s+score)', t, re.I):
        return "records-statistics"
    
    # Notable Figures & Legends
    if re.search(r'(legendary|iconic|pioneer|known\s+as|nickname|famously\s+(known|called)|widely\s+(known|regarded)|first\s+(boxer|woman|player|athlete))', t, re.I):
        return "notable-figures"
    if re.search(r'(broke\s+the\s+color\s+barrier|who\s+defeated|first\s+to\s+(defeat|win))', t, re.I):
        return "notable-figures"
    
    # Historical Moments
    if re.search(r'(overcame\s+a\s+\d+-\d+\s+deficit|complete\s+(an\s+)?undefeated\s+season|won\s+(Super\s+Bowl|the\s+World\s+Series|the\s+Stanley\s+Cup|the\s+NBA\s+Finals)\s+[IXV]+|first\s+(modern\s+)?Olympic)', t, re.I):
        return "historical-moments"
    if re.search(r'^(Who|Which)\s+(won|is\s+the\s+winner|hosted|country\s+hosted|team\s+won)', t, re.I) and not re.search(r'(record|most|all-time|holds?)', t, re.I):
        return "historical-moments"
    
    # Rules & Terminology
    if re.search(r'^(How\s+many|In\s+what\s+sport|What\s+(sport|is\s+the\s+term|is\s+the\s+(maximum|lowest|minimum)|is\s+the\s+name\s+of\s+the\s+(international|governing|official|championship))|In\s+which\s+(sport|Olympic))', t, re.I):
        return "rules-terminology"
    if re.search(r'(term\s+(for|used)|called|score\s+(of|is\s+represented)|position|governing\s+body|maximum\s+(number|score)|official\s+name)', t, re.I):
        return "rules-terminology"
    
    # Default
    return "historical-moments"


def classify_history(t, q_answer, q_slug):
    """History & Government - 494 questions"""
    
    # US History & Government
    if re.search(r'(Constitution|amendment|article\s+(I|II|III)|Congress|President\s+of\s+the\s+United\s+States|Supreme\s+Court|House\s+of\s+Representatives|Senate|Electoral\s+College|Bill\s+of\s+Rights|Declaration\s+of\s+Independence|impeachment|veto|federalism|checks\s+and\s+balances|separation\s+of\s+powers|national\s+anthem|bald\s+eagle| stripes|stars\s+on\s+the|We\s+the\s+People)', t, re.I):
        return "us-history-government"
    if re.search(r'^(Which|What)\s+US\s+(President|state|constitutional)', t, re.I):
        return "us-history-government"
    if re.search(r'(American\s+(Civil\s+War|Revolution|history)|United\s+States\s+(purchased|bought|fought)|slavery|Civil\s+(War|Rights)|Underground\s+Railroad|Ellis\s+Island|Dust\s+Bowl|Jim\s+Crow|Marshall\s+Plan|Korean\s+War|Cuban\s+Missile|Vietnam\s+War|Pearl\s+Harbor)', t, re.I):
        return "us-history-government"
    if re.search(r'(Louisiana\s+Purchase|Trail\s+of\s+Tears|Indian\s+Removal|Gettysburg|Fort\s+Sumter|Transcontinental\s+Railroad|Hiroshima|Nagasaki|D-Day|Great\s+Depression|New\s+Deal|Cold\s+War)', t, re.I):
        return "us-history-government"
    
    # Famous Figures & Quotes
    if re.search(r'famously\s+(said|noted|asserted|remarked|observed|quipped|advised|instructed|declared|wrote|told|clarified|defined|offered)', t, re.I):
        return "famous-figures-quotes"
    if re.search(r'(famous\s+quote|said|once\s+said|is\s+credited\s+with\s+(saying|inventing|developing)|is\s+widely\s+(known|credited)\s+for)', t, re.I):
        return "famous-figures-quotes"
    
    # Wars, Battles & Conflicts
    if re.search(r'(World\s+War\s+(I|II|One|Two)|battle\s+of|war\s+(between|fought|was\s+fought|started|ended|triggered)|assassination\s+of|atomic\s+bomb|nuclear\s+(standoff|weapon)|treaty\s+of|surrender\s+of|declaration\s+of\s+war)', t, re.I):
        return "wars-battles-conflicts"
    
    # Ancient & Medieval History
    if re.search(r'(ancient|empire|emperor|pharaoh|medieval|dynasty|Roman\s+(Empire|Republic)|Greek|Egyptian|Mesopotamia|Babylonian|Mongol|Ottoman|Inca|Aztec|Maya|Viking|feudal|crusade|kingdom|pharaoh|gladiator|Spartan|Athenian|Hammurabi|Pharaoh|Mansa\s+Musa|Genghis\s+Khan|Cleopatra)', t, re.I):
        return "ancient-medieval"
    if re.search(r'^(Who|Which)\s+(was\s+the\s+first|founded|conquered|led|ruled|discovered)', t, re.I) and not re.search(r'(US|United\s+States|President|amendment|Constitution)', t, re.I):
        return "ancient-medieval"
    
    # Cultural & Social History
    if re.search(r'(Renaissance|Industrial\s+Revolution|Reformation|Enlightenment|movement|social|protest|culture|economic|philosophy|religion|art|music|literature|science\s+\w+\s+century)', t, re.I):
        return "cultural-social-history"
    if re.search(r'^(In\s+what\s+year|In\s+which\s+(year|country|city)|What\s+year|When\s+(did|was))', t, re.I):
        return "cultural-social-history"
    
    # Default - try to route based on remaining patterns
    if re.search(r'^(Who|Which)\s+', t, re.I):
        return "famous-figures-quotes"
    
    return "cultural-social-history"


def classify_music(t, q_answer, q_slug):
    """Music - 316 questions"""
    
    # Artists & Bands: "Name the [genre] band that consists of..."
    if re.search(r'^Name\s+the\s+', t, re.I):
        return "artists-bands"
    if re.search(r'consists?\s+of\s+', t, re.I):
        return "artists-bands"
    if re.search(r'(Which\s+artist|Who\s+(is|was)\s+the\s+(lead\s+singer|frontman|founder|drummer|guitarist|bassist|producer|member))', t, re.I):
        return "artists-bands"
    if re.search(r'(alter\s+ego|stage\s+name|real\s+name|birth\s+name|known\s+as|nickname)', t, re.I):
        return "artists-bands"
    if re.search(r'(band|group|duo|quartet|trio|singer|songwriter|musician)\s+(that|who|known|consists|formed|originated)', t, re.I):
        return "artists-bands"
    
    # Albums, Songs & Lyrics: "Complete this lyric"
    if re.search(r'^(Complete|Finish)\s+this\s+', t, re.I):
        return "albums-songs-lyrics"
    if re.search(r'(lyric|lyrics|song\s+title|album\s+(title|name|cover)|hit\s+(song|single)|released\s+the\s+(album|song|hit|single))', t, re.I):
        return "albums-songs-lyrics"
    if re.search(r'Which\s+(album|song)\s+', t, re.I):
        return "albums-songs-lyrics"
    if re.search(r'(What\s+(was|is)\s+the\s+(title|name|hit))', t, re.I):
        return "albums-songs-lyrics"
    
    # Music History & Events
    if re.search(r'^(In\s+which\s+year|In\s+what\s+year|In\s+which\s+decade|What\s+year|When\s+(did|was))', t, re.I):
        return "music-history-events"
    if re.search(r'(Woodstock|Grammy|Eurovision|first\s+(rap|hip-hop)\s+song|Billboard|Vevo|Pulitzer)', t, re.I):
        return "music-history-events"
    
    # Genres, Instruments & Terminology
    if re.search(r'(genre|instrument|vocal\s+range|time\s+signature|interval|tempo|note\s+|scale|chord|key\s+of|pitch|rhythm|melody|harmony|orchestra|symphony|classical|jazz|blues|rock|pop|hip-hop|R&B|country|folk|electronic|metal|punk|reggae|motown)', t, re.I):
        return "genres-instruments-terminology"
    if re.search(r'(What\s+(musical|is\s+the\s+(common\s+)?(name|term)|is\s+the\s+highest|is\s+the\s+smallest))', t, re.I):
        return "genres-instruments-terminology"
    if re.search(r'(what\s+note|guitar|piano|drum|violin|trumpet|saxophone|flute|clarinet|bassoon|vocal)', t, re.I):
        return "genres-instruments-terminology"
    
    # Contemporary & Pop Culture
    if re.search(r'(Taylor\s+Swift|Beyoncé|Beyonce|Adele|Billie\s+Eilish|Lady\s+Gaga|Katy\s+Perry|Lil\s+Nas\s+X|BTS|K-Pop|streaming|Eras\s+Tour|202[0-9]|20[2-9][0-9])', t, re.I):
        return "contemporary-pop-culture"
    
    # Default
    return "artists-bands"


def classify_geography(t, q_answer, q_slug):
    """Geography - 561 questions"""
    
    # Map Identification
    if re.search(r'(shown\s+highlighted\s+on\s+this\s+map|highlighted\s+on\s+the\s+map)', t, re.I):
        return "map-identification"
    
    # Landmarks & Wonders (narrative description style)
    if re.search(r'^(Constructed|Commissioned|Perched|Originally\s+(constructed|built)|Dominat|Engineered|Located|Piercing|Designed|Carved|Sculpted|Built|Housed|Opened|Serving)', t, re.I):
        return "landmarks-wonders"
    if re.search(r'(Eiffel\s+Tower|Machu\s+Picchu|Taj\s+Mahal|Colosseum|Sagrada\s+Família|Petra|Angkor\s+Wat|Statue\s+of\s+Liberty|Christ\s+the\s+Redeemer|Chichen\s+Itza|Golden\s+Gate\s+Bridge|Stonehenge|Burj\s+Khalifa|Sydney\s+Opera\s+House|Great\s+Sphinx|Acropolis|Mount\s+Rushmore|Hagia\s+Sophia|St\.\s+Basil\'s|Brandenburg\s+Gate|Forbidden\s+City|Leaning\s+Tower|Palace\s+of\s+Versailles|CN\s+Tower|Panama\s+Canal|Louvre)', t, re.I):
        return "landmarks-wonders"
    
    # US States & Quirky Facts
    if re.search(r'(which\s+(US\s+)?state|state\s+(seal|motto|flag|nickname|capital)|grand\s+canyon|in\s+which\s+(northern|southern|eastern|western|midwestern|coastal|New\s+England))', t, re.I):
        return "us-states-quirky"
    if re.search(r'(official\s+state\s+(soil|flower|bird|tree|animal)|misdemeanor\s+to|legally\s+declared|technically\s+illegal|blue\s+law|oddly\s+contains|quirky|Carhenge|ostrich\s+festival)', t, re.I):
        return "us-states-quirky"
    
    # Physical Geography
    if re.search(r'(river|mountain|ocean|sea|lake|desert|island|continent|trench|peninsula|strait|canal|bay|gulf|waterfall|glacier|reef|basin|plateau|valley|plain|volcano)', t, re.I):
        return "physical-geography"
    if re.search(r'^(Which\s+is\s+the\s+(largest|smallest|highest|longest|deepest|biggest|driest)|What\s+is\s+the\s+(largest|smallest|highest|longest|deepest|driest))', t, re.I):
        return "physical-geography"
    if re.search(r'(longest\s+(river|coastline)|largest\s+(hot\s+)?desert|highest\s+mountain|deepest\s+point|largest\s+island|smallest\s+continent|driest\s+continent)', t, re.I):
        return "physical-geography"
    
    # Countries, Capitals & Borders
    if re.search(r'(capital\s+city|capital\s+of|bordered\s+by|borders\s+|located\s+in\s+which\s+country)', t, re.I):
        return "countries-capitals-borders"
    if re.search(r'^(What\s+is\s+the\s+capital|Which\s+country\s+(is|has|was|does|borders)|In\s+which\s+country)', t, re.I):
        return "countries-capitals-borders"
    
    # Default
    return "countries-capitals-borders"


def classify_art_literature(t, q_answer, q_slug):
    """Art, Literature and Comics - 303 questions"""
    
    # Language & Grammar
    if re.search(r'(part\s+of\s+speech|grammatical|linguistic|figure\s+of\s+speech|literary\s+device|noun|verb|adjective|adverb|pronoun|preposition|conjunction|interjection|prefix|suffix|synonym|antonym|homonym|onomatopoeia|metaphor|simile|personification|alliteration|oxymoron|euphemism|malapropism|portmanteau|palindrome|anagram|idiom|cliché|cliche|acronym|abbreviation|etymology|syntax|subject\s+grammar|rhyme|vowel|consonant|punctuation|comma|question\s+mark|contraction|compound\s+word)', t, re.I):
        return "language-grammar"
    
    # Art History & Artists
    if re.search(r'(artist\s+(painted|sculpted|created|drew)|painting|sculpture|mural|portrait|self-portrait|paint|canvas|art\s+(movement|history|work)|artistic|painted\s+by|artist\s+named|street\s+artist|Banksy|Picasso|van\s+Gogh|Warhol|Michelangelo|Da\s+Vinci|Rembrandt|Monet|Botticelli|Rockwell|Grant\s+Wood)', t, re.I):
        return "art-history-artists"
    
    # Comics & Graphic Novels
    if re.search(r'(superhero|supervillain|comic\s+book|graphic\s+novel|Marvel|DC\s+Comics|Batman|Superman|Spider-Man|Wonder\s+Woman|X-Men|Avengers|Fantastic\s+Four|Watchmen|graphic\s+novel|iron\s+man|hulk|captain\s+america|secret\s+identity|comic\s+series)', t, re.I):
        return "comics-graphic-novels"
    
    # Classic Literature
    if re.search(r'(novel|author\s+wrote|book\s+(series|by|about)|opening\s+line\s+read|playwright|dramatist|epic\s+poem|short\s+story|fairy\s+tale|children\'s\s+(book|literature)|young\s+adult|novella|Gothic|dystopian|bildungsroman)', t, re.I):
        return "classic-literature"
    if re.search(r'^Which\s+(author|English|Irish|German|American|novelist|playwright|poet|writer)', t, re.I):
        return "classic-literature"
    
    # Adaptations & Theater
    if re.search(r'(adapted\s+into|Broadway|musical|Tony\s+Award|Pulitzer\s+Prize|stage\s+(play|adaptation)|theater|motion\s+picture|film\s+(adaptation|version))', t, re.I):
        return "adaptations-theater"
    if re.search(r'(Hamilton|Wicked|Sweeney\s+Todd|Rent|Book\s+of\s+Mormon|Les\s+Misérables|Phantom\s+of\s+the\s+Opera)', t, re.I):
        return "adaptations-theater"
    
    # Default
    return "classic-literature"


def classify_television(t, q_answer, q_slug):
    """Television - 314 questions"""
    
    # Animated Series
    if re.search(r'(Simpsons|SpongeBob|South\s+Park|Family\s+Guy|Bob\'s\s+Burgers|Scooby\s+Doo|Rick\s+and\s+Morty|Futurama|American\s+Dad|Archer|King\s+of\s+the\s+Hill|Adventure\s+Time|Regular\s+Show|Flintstones|Animaniacs|Invader\s+Zim|Ed,\s*Edd\s*,\s*n\s*Eddy|Rugrats|Hey\s+Arnold|Avatar|BoJack\s+Horseman|The\s+Critic)', t, re.I):
        return "animated-series"
    if re.search(r'(cartoon|animated\s+series|Scooby\s+Snacks|Duff\s+Beer|Krusty|Springfield|Mr\.\s+Burns|Homer\s+Simpson|SpongeBob|Reptar|Master\s+Splinter|Teenage\s+Mutant)', t, re.I):
        return "animated-series"
    
    # Reality & Competition
    if re.search(r'(Real\s+Housewives|Vanderpump\s+Rules|RuPaul|Drag\s+Race|Survivor|The\s+Bachelor|Bachelorette|Love\s+Island|Keeping\s+Up\s+with\s+the\s+Kardashians|Scandoval|The\s+Valley|Jersey\s+Shore)', t, re.I):
        return "reality-competition"
    
    # SNL, Late Night & Recent Series
    if re.search(r'(Saturday\s+Night\s+Live|SNL|Weekend\s+Update|Chris\s+Farley|Adam\s+Sandler|Will\s+Ferrell|Kristen\s+Wiig|Kenan\s+Thompson|Darrell\s+Hammond|Norm\s+Macdonald|Mike\s+Myers|Dana\s+Carvey|Dan\s+Aykroyd|John\s+Belushi|Blues\s+Brothers|Wayne\'s\s+World)', t, re.I):
        return "snl-late-night-recent"
    if re.search(r'(Severance|The\s+Bear|Ted\s+Lasso|Abbott\s+Elementary|The\s+White\s+Lotus|Euphoria|Yellowjackets|Only\s+Murders|Poker\s+Face|Barry\s+HBO|Hacks|Reservation\s+Dogs|The\s+Last\s+of\s+Us|The\s+Mandalorian|Peaky\s+Blinders|Bridgerton|Squid\s+Game)', t, re.I):
        return "snl-late-night-recent"
    if re.search(r'(202[0-9]|20[2-9][0-9]|Emmy-winning|Emmy\s+Award)', t, re.I):
        return "snl-late-night-recent"
    
    # Sitcoms & Comedy
    if re.search(r'(The\s+Office|Friends|Seinfeld|How\s+I\s+Met\s+Your\s+Mother|Parks\s+and\s+Recreation|Modern\s+Family|Community|New\s+Girl|Brooklyn\s+Nine-Nine|The\s+Big\s+Bang\s+Theory|That\s+\'70s\s+Show|Scrubs|Frasier|Cheers|Always\s+Sunny|It\'s\s+Always\s+Sunny|Arrested\s+Development|30\s+Rock|The\s+Mindy\s+Project|Happy\s+Endings|Superstore|Schitt\'s\s+Creek|Veep|Silicon\s+Valley|Curb\s+Your\s+Enthusiasm|The\s+Good\s+Place|Unbreakable\s+Kimmy\s+Schmidt|Grace\s+and\s+Frankie|The\s+Marvelous\s+Mrs\.\s+Maisel)', t, re.I):
        return "sitcoms-comedy"
    
    # Drama & Premium Cable (catch-all for everything else explicitly dramatic)
    if re.search(r'(Breaking\s+Bad|Game\s+of\s+Thrones|The\s+Sopranos|Better\s+Call\s+Saul|The\s+Wire|Succession|Mad\s+Men|The\s+Crown|Stranger\s+Things|The\s+Walking\s+Dead|True\s+Detective|The\s+West\s+Wing|Buffy\s+the\s+Vampire\s+Slayer|The\s+Handmaid\'s\s+Tale|Fargo|Dexter|Homeland|House\s+of\s+Cards|Narcos|The\s+Americans|Justified|Lost|Twin\s+Peaks|The\s+X-Files|Band\s+of\s+Brothers|The\s+Night\s+Of|Ozark|The\s+Shield|Deadwood|Boardwalk\s+Empire|Rome|Spartacus|Vikings|The\s+Boys|Invincible|The\s+Expanse|Yellowstone|1923)', t, re.I):
        return "drama-cable"
    
    # Default - most TV questions start with "In/On [show]" which makes them show-specific
    # Try to classify based on whether it sounds like a sitcom or drama
    if re.search(r'(George\s+Costanza|Kramer|Elaine|Jerry\s+Seinfeld|Michael\s+Scott|Dwight\s+Schrute|Ron\s+Swanson|Leslie\s+Knope|Tom\s+Haverford|Barney\s+Stinson|Ted\s+Mosby|Marshall|Lily|Robin|Sheldon|Penny|Phoebe\s+Buffay|Monica|Rachel|Chandler|Joey|Ross|Jess\s+\w+|Nick\s+Miller|Schmidt|Winston|Cece|Jake\s+Peralta|Amy\s+Santiago|Captain\s+Holt|Rosa\s+Diaz|Charles\s+Boyle|Phil\s+Dunphy|Claire\s+Dunphy|Cam\s+Tucker|Mitchell\s+Pritchett|Gloria|Jay\s+Pritchett)', t, re.I):
        return "sitcoms-comedy"
    
    return "drama-cable"


# ============================================================
# Mapping of files to classification functions
# ============================================================

CLASSIFIERS = {
    "movies.json": classify_movies,
    "science.v1.json": classify_science,
    "sports.v1.json": classify_sports,
    "history.v1.json": classify_history,
    "music.v1.json": classify_music,
    "geography.v1.json": classify_geography,
    "art-literature.json": classify_art_literature,
    "television.json": classify_television,
}

# ============================================================
# Main processing
# ============================================================

def main():
    for fname, classifier in CLASSIFIERS.items():
        fpath = DATA_DIR / fname
        if not fpath.exists():
            print(f"SKIP: {fname} not found")
            continue
        
        # Create backup
        bak_path = fpath.with_suffix(fpath.suffix + ".bak")
        shutil.copy2(fpath, bak_path)
        
        with open(fpath, 'r') as f:
            data = json.load(f)
        
        questions = data.get('questions', [])
        cat_name = data.get('categoryName', fname)
        
        classified = 0
        for q in questions:
            q_text = q.get('question', '')
            q_answer = q.get('answer', '')
            q_slug = q.get('slug', '')
            
            subcat = classifier(q_text, q_answer, q_slug)
            q['subcategory'] = subcat
            classified += 1
        
        # Write back
        with open(fpath, 'w') as f:
            json.dump(data, f, indent=2)
        
        # Count subcategories
        from collections import Counter
        counts = Counter(q.get('subcategory') for q in questions)
        
        print(f"\n✅ {cat_name} ({fname}) — {classified} questions classified")
        print(f"   Backup saved to {bak_path}")
        for subcat, count in counts.most_common():
            print(f"   • {subcat}: {count}")


if __name__ == "__main__":
    main()
