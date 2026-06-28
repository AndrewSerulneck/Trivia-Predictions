#!/usr/bin/env python3
"""
Process Jeopardy! TSV data into Live Trivia review JSON files.

For each row in the TSV:
  1. Maps the Jeopardy category -> Live Trivia category + subcategory
  2. Rephrases the clue into a proper direct question
  3. Flags candidates that would benefit from images
  4. Outputs organized review JSON files per target category
"""

import csv
import json
import os
import re
import sys
from collections import defaultdict

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TSV_PATH = os.path.join(BASE_DIR, "data/live-trivia/review/season1.tsv")
OUT_DIR = os.path.join(BASE_DIR, "data/live-trivia/review")

os.makedirs(OUT_DIR, exist_ok=True)

# ============================================================
# CATEGORY MAPPING
# ============================================================
# Maps Jeopardy category names -> (live_trivia_category, subcategory)
# New categories we'll create: "Food & Drink", "Religion & Mythology", "Language & Words", "Business & Economics"

CATEGORY_MAP = {
    # ===== SPORTS =====
    "SPORTS": ("Sports", "historical-moments"),
    "BASEBALL": ("Sports", "historical-moments"),
    "BASKETBALL": ("Sports", "historical-moments"),
    "FOOTBALL": ("Sports", "historical-moments"),
    "SOCCER": ("Sports", "historical-moments"),
    "HOCKEY": ("Sports", "historical-moments"),
    "GOLF": ("Sports", "historical-moments"),
    "TENNIS": ("Sports", "historical-moments"),
    "BOXING": ("Sports", "historical-moments"),
    "SKIING": ("Sports", "historical-moments"),
    "WINTER SPORTS": ("Sports", "historical-moments"),
    "WATER SPORTS": ("Sports", "historical-moments"),
    "SPORTS LEGENDS": ("Sports", "notable-figures"),
    "SPORTS NICKNAMES": ("Sports", "notable-figures"),
    "SPORTS TRIVIA": ("Sports", "historical-moments"),
    "SPORTS QUOTES": ("Sports", "historical-moments"),
    "SPORTS MOVIES": ("Sports", "historical-moments"),
    "SPORTS STADIUMS": ("Sports", "historical-moments"),
    "ATHLETES": ("Sports", "notable-figures"),
    "THE OLYMPICS": ("Sports", "historical-moments"),
    "OLYMPICS": ("Sports", "historical-moments"),
    "WORLD SERIES": ("Sports", "historical-moments"),
    "SPORT OF KINGS": ("Sports", "historical-moments"),
    "RULES OF THE GAME": ("Sports", "rules-terminology"),
    "SPORTS SHIFTS": ("Sports", "rules-terminology"),
    "WOMEN IN SPORTS": ("Sports", "notable-figures"),
    "ARCHERY": ("Sports", "historical-moments"),

    # ===== SCIENCE & TECH =====
    "SCIENCE": ("Science & Tech", "physics-concepts"),
    "ASTRONOMY": ("Science & Tech", "astronomy-earth-science"),
    "THE SOLAR SYSTEM": ("Science & Tech", "astronomy-earth-science"),
    "SPACE": ("Science & Tech", "astronomy-earth-science"),
    "PHYSICS": ("Science & Tech", "physics-concepts"),
    "PHYSICAL SCIENCE": ("Science & Tech", "physics-concepts"),
    "CHEMISTRY": ("Science & Tech", "chemistry-periodic-table"),
    "BIOLOGY": ("Science & Tech", "biology-human-body"),
    "ANATOMY": ("Science & Tech", "biology-human-body"),
    "THE BODY": ("Science & Tech", "biology-human-body"),
    "BOTANY": ("Science & Tech", "biology-human-body"),
    "ZOOLOGY": ("Science & Tech", "biology-human-body"),
    "ANIMALS": ("Science & Tech", "biology-human-body"),
    "MAMMALS": ("Science & Tech", "biology-human-body"),
    "REPTILES": ("Science & Tech", "biology-human-body"),
    "WHALES": ("Science & Tech", "biology-human-body"),
    "BEARS": ("Science & Tech", "biology-human-body"),
    "BEES": ("Science & Tech", "biology-human-body"),
    "SPIDERS": ("Science & Tech", "biology-human-body"),
    "SONGBIRDS": ("Science & Tech", "biology-human-body"),
    "SONG BIRDS": ("Science & Tech", "biology-human-body"),
    "PLANTS": ("Science & Tech", "biology-human-body"),
    "TREES": ("Science & Tech", "biology-human-body"),
    "VEGETABLES": ("Science & Tech", "biology-human-body"),
    "NUTS": ("Science & Tech", "biology-human-body"),
    "MEDICINE": ("Science & Tech", "medicine-technology"),
    "PUBLIC HEALTH": ("Science & Tech", "medicine-technology"),
    "NUTRITION": ("Science & Tech", "medicine-technology"),
    "AILMENTS": ("Science & Tech", "medicine-technology"),
    "TECHNOLOGY": ("Science & Tech", "medicine-technology"),
    "INVENTIONS": ("Science & Tech", "medicine-technology"),
    "NUCLEAR PHYSICS": ("Science & Tech", "physics-concepts"),
    "THE BRAIN": ("Science & Tech", "biology-human-body"),
    "THE MIND": ("Science & Tech", "biology-human-body"),
    "THE SENSES": ("Science & Tech", "biology-human-body"),
    "GENETICS": ("Science & Tech", "biology-human-body"),
    "DINOSAURS": ("Science & Tech", "biology-human-body"),
    "MATHEMATICS": ("Science & Tech", "physics-concepts"),
    "NUMBERS": ("Science & Tech", "physics-concepts"),
    "NUMBER PLEASE": ("Science & Tech", "physics-concepts"),
    "NUMBER, PLEASE": ("Science & Tech", "physics-concepts"),
    "WEIGHTS & MEASURES": ("Science & Tech", "physics-concepts"),
    "ROCKS & MINERALS": ("Science & Tech", "astronomy-earth-science"),
    "THE OCEAN": ("Science & Tech", "astronomy-earth-science"),
    "WATER": ("Science & Tech", "astronomy-earth-science"),
    "THE DESERT": ("Science & Tech", "astronomy-earth-science"),
    "WEATHER": ("Science & Tech", "astronomy-earth-science"),
    "AGRICULTURE": ("Science & Tech", "astronomy-earth-science"),
    "THE GARDEN": ("Science & Tech", "astronomy-earth-science"),
    "ARCHAEOLOGY": ("Science & Tech", "astronomy-earth-science"),

    # ===== HISTORY & GOVERNMENT =====
    "HISTORY": ("History & Government", "cultural-social-history"),
    "WORLD HISTORY": ("History & Government", "cultural-social-history"),
    "U.S. HISTORY": ("History & Government", "us-history-government"),
    "AMERICAN HISTORY": ("History & Government", "us-history-government"),
    "AMERICAN REVOLUTION": ("History & Government", "us-history-government"),
    "THE AMERICAN REVOLUTION": ("History & Government", "us-history-government"),
    "THE CIVIL WAR": ("History & Government", "us-history-government"),
    "CIVIL WAR": ("History & Government", "us-history-government"),
    "WORLD WAR I": ("History & Government", "wars-battles-conflicts"),
    "WORLD WAR II": ("History & Government", "wars-battles-conflicts"),
    "WWII": ("History & Government", "wars-battles-conflicts"),
    "WARS": ("History & Government", "wars-battles-conflicts"),
    "ANCIENT HISTORY": ("History & Government", "ancient-medieval"),
    "ANCIENT GREECE": ("History & Government", "ancient-medieval"),
    "ANCIENT WORLDS": ("History & Government", "ancient-medieval"),
    "THE MIDDLE AGES": ("History & Government", "ancient-medieval"),
    "THE RENAISSANCE": ("History & Government", "ancient-medieval"),
    "RENAISSANCE": ("History & Government", "ancient-medieval"),
    "PRESIDENTS": ("History & Government", "us-history-government"),
    "PRESIDENTIAL TRIVIA": ("History & Government", "us-history-government"),
    "PRESIDENTIAL FIRSTS": ("History & Government", "us-history-government"),
    "PRESIDENTIAL QUOTES": ("History & Government", "famous-figures-quotes"),
    "U.S. PRESIDENTS": ("History & Government", "us-history-government"),
    "VICE PRESIDENTS": ("History & Government", "us-history-government"),
    "VICE-PRESIDENTS": ("History & Government", "us-history-government"),
    "WORLD LEADERS": ("History & Government", "famous-figures-quotes"),
    "RULERS": ("History & Government", "famous-figures-quotes"),
    "ROYALTY": ("History & Government", "famous-figures-quotes"),
    "TITLED HEADS": ("History & Government", "famous-figures-quotes"),
    "AMERICAN GOVERNMENT": ("History & Government", "us-history-government"),
    "U.S. GOVERNMENT": ("History & Government", "us-history-government"),
    "GOVERNMENT": ("History & Government", "us-history-government"),
    "THE CONSTITUTION": ("History & Government", "us-history-government"),
    "THE SUPREME COURT": ("History & Government", "us-history-government"),
    "THE CABINET": ("History & Government", "us-history-government"),
    "U.S. SENATE": ("History & Government", "us-history-government"),
    "CONGRESS": ("History & Government", "us-history-government"),
    "DEMOCRATS": ("History & Government", "us-history-government"),
    "REPUBLICANS": ("History & Government", "us-history-government"),
    "POLITICS": ("History & Government", "us-history-government"),
    "WORLD POLITICS": ("History & Government", "us-history-government"),
    "POLITICAL QUOTES": ("History & Government", "famous-figures-quotes"),
    "POLITICAL SLOGANS": ("History & Government", "us-history-government"),
    "TYPES OF GOVERNMENT": ("History & Government", "us-history-government"),
    "REVOLUTIONS": ("History & Government", "wars-battles-conflicts"),
    "RUSSIAN REVOLUTION": ("History & Government", "wars-battles-conflicts"),
    "NAPOLEON": ("History & Government", "famous-figures-quotes"),
    "BEN FRANKLIN": ("History & Government", "famous-figures-quotes"),
    "WOMEN IN HISTORY": ("History & Government", "cultural-social-history"),
    "WOMEN IN POLITICS": ("History & Government", "us-history-government"),
    "WOMEN LEADERS": ("History & Government", "famous-figures-quotes"),
    "FAMOUS QUOTES": ("History & Government", "famous-figures-quotes"),
    "QUOTE, UNQUOTE": ("History & Government", "famous-figures-quotes"),
    "NOTORIOUS": ("History & Government", "famous-figures-quotes"),
    "ASSASSINS": ("History & Government", "famous-figures-quotes"),
    "OUTLAWS": ("History & Government", "famous-figures-quotes"),
    "THE 20TH CENTURY": ("History & Government", "cultural-social-history"),
    "20TH CENTURY": ("History & Government", "cultural-social-history"),
    "19TH CENTURY AMERICA": ("History & Government", "us-history-government"),
    "POST-WAR WORLD": ("History & Government", "cultural-social-history"),
    "THE '20s": ("History & Government", "cultural-social-history"),
    "THE '30S": ("History & Government", "cultural-social-history"),
    "THE '30s": ("History & Government", "cultural-social-history"),
    "THE '40S": ("History & Government", "cultural-social-history"),
    "THE '50s": ("History & Government", "cultural-social-history"),
    "THE '60S": ("History & Government", "cultural-social-history"),
    "THE '60s": ("History & Government", "cultural-social-history"),
    "THE '70s": ("History & Government", "cultural-social-history"),
    "ROARING '20S": ("History & Government", "cultural-social-history"),
    "1940": ("History & Government", "cultural-social-history"),
    "1945": ("History & Government", "cultural-social-history"),
    "1953": ("History & Government", "cultural-social-history"),
    "1955": ("History & Government", "cultural-social-history"),
    "1956": ("History & Government", "cultural-social-history"),
    "1959": ("History & Government", "cultural-social-history"),
    "1960": ("History & Government", "cultural-social-history"),
    "1961": ("History & Government", "cultural-social-history"),
    "1963": ("History & Government", "cultural-social-history"),
    "1964": ("History & Government", "cultural-social-history"),
    "1965": ("History & Government", "cultural-social-history"),
    "1967": ("History & Government", "cultural-social-history"),
    "1968": ("History & Government", "cultural-social-history"),
    "1972": ("History & Government", "cultural-social-history"),
    "1983": ("History & Government", "cultural-social-history"),
    "1984": ("History & Government", "cultural-social-history"),
    "1890S": ("History & Government", "cultural-social-history"),
    "ARMED FORCES": ("History & Government", "wars-battles-conflicts"),
    "THE ARMED SERVICES": ("History & Government", "wars-battles-conflicts"),
    "THE MILITARY": ("History & Government", "wars-battles-conflicts"),
    "ADMIRALS": ("History & Government", "wars-battles-conflicts"),
    "WEAPONS": ("History & Government", "wars-battles-conflicts"),
    "SHIPS": ("History & Government", "wars-battles-conflicts"),
    "AMERICAN INDIANS": ("History & Government", "cultural-social-history"),
    "WILD WEST": ("History & Government", "cultural-social-history"),
    "THE OLD WEST": ("History & Government", "cultural-social-history"),
    "THE WHITE HOUSE": ("History & Government", "us-history-government"),
    "WHITE HOUSE": ("History & Government", "us-history-government"),
    "SOVIET UNION": ("History & Government", "cultural-social-history"),
    "RUSSIA": ("History & Government", "cultural-social-history"),
    "SCOTLAND": ("History & Government", "cultural-social-history"),
    "THE IRISH": ("History & Government", "cultural-social-history"),
    "SWITZERLAND": ("History & Government", "cultural-social-history"),
    "POLAND": ("History & Government", "cultural-social-history"),
    "BELGIUM": ("History & Government", "cultural-social-history"),
    "TURKEY": ("History & Government", "cultural-social-history"),
    "SPAIN": ("History & Government", "cultural-social-history"),
    "VIRGINIA": ("History & Government", "us-history-government"),
    "TEXAS": ("History & Government", "us-history-government"),
    "WASHINGTON D.C.": ("History & Government", "us-history-government"),
    "PEOPLE": ("History & Government", "famous-figures-quotes"),

    # ===== GEOGRAPHY =====
    "GEOGRAPHY": ("Geography", "physical-geography"),
    "WORLD GEOGRAPHY": ("Geography", "physical-geography"),
    "U.S. GEOGRAPHY": ("Geography", "us-states-quirky"),
    "U.S. STATES": ("Geography", "us-states-quirky"),
    "STATE CAPITALS": ("Geography", "countries-capitals-borders"),
    "WORLD CAPITALS": ("Geography", "countries-capitals-borders"),
    "U.S. CITIES": ("Geography", "us-states-quirky"),
    "WORLD CITIES": ("Geography", "countries-capitals-borders"),
    "NEW YORK CITY": ("Geography", "landmarks-wonders"),
    "EUROPE": ("Geography", "physical-geography"),
    "ASIA": ("Geography", "physical-geography"),
    "AFRICA": ("Geography", "physical-geography"),
    "SOUTH AMERICA": ("Geography", "physical-geography"),
    "NORTH AMERICA": ("Geography", "physical-geography"),
    "THE AMERICAS": ("Geography", "physical-geography"),
    "AUSTRALIA": ("Geography", "physical-geography"),
    "THE FAR EAST": ("Geography", "physical-geography"),
    "THE MIDDLE EAST": ("Geography", "physical-geography"),
    "UNITED KINGDOM": ("Geography", "physical-geography"),
    "CANADA": ("Geography", "physical-geography"),
    "MEXICO": ("Geography", "physical-geography"),
    "ITALY": ("Geography", "physical-geography"),
    "FRANCE": ("Geography", "physical-geography"),
    "ENGLAND": ("Geography", "physical-geography"),
    "GERMANY": ("Geography", "physical-geography"),
    "JAPAN": ("Geography", "physical-geography"),
    "CHINA": ("Geography", "physical-geography"),
    "INDIA": ("Geography", "physical-geography"),
    "ISRAEL": ("Geography", "physical-geography"),
    "RIVERS": ("Geography", "physical-geography"),
    "LAKES & RIVERS": ("Geography", "physical-geography"),
    "SEAPORTS": ("Geography", "physical-geography"),
    "U.S. LANDMARKS": ("Geography", "landmarks-wonders"),
    "NATIONAL LANDMARKS": ("Geography", "landmarks-wonders"),
    "LANDMARKS": ("Geography", "landmarks-wonders"),
    "PARKS": ("Geography", "landmarks-wonders"),
    "7 WONDERS": ("Geography", "landmarks-wonders"),
    "TRAVEL": ("Geography", "landmarks-wonders"),
    "TRAVEL & TOURISM": ("Geography", "landmarks-wonders"),
    "TRAVEL U.S.A.": ("Geography", "us-states-quirky"),
    "TOURIST TRAPS": ("Geography", "landmarks-wonders"),
    "U.S. BEACHES": ("Geography", "us-states-quirky"),
    "THE CALENDAR": ("Geography", "physical-geography"),
    "TIME": ("Geography", "physical-geography"),
    "STATE MOTTOES": ("Geography", "us-states-quirky"),
    "STATES IN SONG": ("Geography", "us-states-quirky"),
    "MAP IDENTIFICATION": ("Geography", "map-identification"),

    # ===== MOVIES =====
    "MOVIES": ("Movies", "plot-quotes-trivia"),
    "MOVIE TRIVIA": ("Movies", "plot-quotes-trivia"),
    "ACTORS & ROLES": ("Movies", "actors-performers"),
    "ACADEMY AWARDS": ("Movies", "awards-history-industry"),
    "THE OSCARS": ("Movies", "awards-history-industry"),
    "OSCAR SONGS": ("Movies", "awards-history-industry"),
    "AWARDS": ("Movies", "awards-history-industry"),
    "BEST PICTURES": ("Movies", "awards-history-industry"),
    "THE MOVIES": ("Movies", "plot-quotes-trivia"),
    "STAR TREK": ("Movies", "characters-lore"),
    "SUPER HEROES": ("Movies", "characters-lore"),
    "\"B\" MOVIES": ("Movies", "plot-quotes-trivia"),
    "\"GOOD\" & \"BAD\" MOVIES": ("Movies", "plot-quotes-trivia"),
    "\"GREAT\" MOVIES": ("Movies", "plot-quotes-trivia"),
    "\"LAST\" MOVIES": ("Movies", "plot-quotes-trivia"),
    "WOODY ALLEN": ("Movies", "actors-performers"),
    "STREISAND FILMS": ("Movies", "actors-performers"),
    "ROBERT REDFORD": ("Movies", "actors-performers"),
    "\"BEN\"": ("Movies", "actors-performers"),
    "WWI FILMS": ("Movies", "biographical-films"),
    "SPORTS MOVIES": ("Movies", "biographical-films"),
    "TENNESSEE WILLIAMS": ("Movies", "biographical-films"),
    "HITCHCOCK": ("Movies", "directors-style"),
    "SCI-FI & FANTASY MOVIES": ("Movies", "characters-lore"),
    "\"STARTS\"": ("Movies", "plot-quotes-trivia"),

    # ===== ART, LITERATURE & COMICS =====
    "LITERATURE": ("Art, Literature and Comics", "classic-literature"),
    "AMERICAN LITERATURE": ("Art, Literature and Comics", "classic-literature"),
    "AUTHORS": ("Art, Literature and Comics", "classic-literature"),
    "PLAYWRIGHTS": ("Art, Literature and Comics", "adaptations-theater"),
    "SHAKESPEARE": ("Art, Literature and Comics", "classic-literature"),
    "POETRY": ("Art, Literature and Comics", "classic-literature"),
    "POE": ("Art, Literature and Comics", "classic-literature"),
    "THEATRE": ("Art, Literature and Comics", "adaptations-theater"),
    "THEATER": ("Art, Literature and Comics", "adaptations-theater"),
    "THE THEATER": ("Art, Literature and Comics", "adaptations-theater"),
    "THEATRICAL CHARACTERS": ("Art, Literature and Comics", "adaptations-theater"),
    "ART": ("Art, Literature and Comics", "art-history-artists"),
    "ARTISTS": ("Art, Literature and Comics", "art-history-artists"),
    "AMERICAN ART": ("Art, Literature and Comics", "art-history-artists"),
    "SCULPTURE": ("Art, Literature and Comics", "art-history-artists"),
    "ARCHITECTURE": ("Art, Literature and Comics", "art-history-artists"),
    "THE COMICS": ("Art, Literature and Comics", "comics-graphic-novels"),
    "DANCE": ("Art, Literature and Comics", "adaptations-theater"),
    "BALLET": ("Art, Literature and Comics", "adaptations-theater"),
    "FASHION": ("Art, Literature and Comics", "art-history-artists"),
    "WORLD OF FASHION": ("Art, Literature and Comics", "art-history-artists"),
    "THE ENGLISH LANGUAGE": ("Art, Literature and Comics", "language-grammar"),
    "WORD ORIGINS": ("Art, Literature and Comics", "language-grammar"),
    "WORD PLAY": ("Art, Literature and Comics", "language-grammar"),
    "SPELLING": ("Art, Literature and Comics", "language-grammar"),
    "PROVERBS": ("Art, Literature and Comics", "literary-quotes-and-lines"),
    "WOMEN AUTHORS": ("Art, Literature and Comics", "classic-literature"),
    "WOMEN WRITERS": ("Art, Literature and Comics", "classic-literature"),
    "CHILDREN'S LITERATURE": ("Art, Literature and Comics", "classic-literature"),
    "FAIRY TALES": ("Art, Literature and Comics", "classic-literature"),
    "NURSERY RHYMES": ("Art, Literature and Comics", "classic-literature"),
    "FABLES": ("Art, Literature and Comics", "classic-literature"),
    "TIMELY LITERATURE": ("Art, Literature and Comics", "classic-literature"),
    "THE LIBRARY": ("Art, Literature and Comics", "classic-literature"),

    # ===== MUSIC =====
    "MUSIC": ("Music", "music-history-events"),
    "POP MUSIC": ("Music", "contemporary-pop-culture"),
    "CLASSICAL MUSIC": ("Music", "genres-instruments-terminology"),
    "OPERA": ("Music", "music-history-events"),
    "ROCK 'N ROLL": ("Music", "contemporary-pop-culture"),
    "ROCK OF THE 80'S": ("Music", "contemporary-pop-culture"),
    "COUNTRY MUSIC": ("Music", "contemporary-pop-culture"),
    "THE BEATLES": ("Music", "artist-identity"),
    "ALL THAT JAZZ": ("Music", "genres-instruments-terminology"),
    "TENORS": ("Music", "artist-identity"),
    "SINGERS & DANCERS": ("Music", "artist-identity"),
    "SONGS OF WAR": ("Music", "music-history-events"),
    "PROTEST SONGS": ("Music", "music-history-events"),
    "PRISON SONGS": ("Music", "music-history-events"),
    "SILLY SONGS": ("Music", "contemporary-pop-culture"),
    "SWEET SONGS": ("Music", "contemporary-pop-culture"),
    "\"BLUE\" SONGS": ("Music", "contemporary-pop-culture"),
    "\"BOYS\" IN SONG": ("Music", "contemporary-pop-culture"),
    "\"DREAM\"Y MUSIC": ("Music", "contemporary-pop-culture"),
    "\"GOOD\" MUSIC": ("Music", "contemporary-pop-culture"),
    "TRAVELIN' TUNES": ("Music", "contemporary-pop-culture"),
    "OSCAR SONGS": ("Music", "awards-history-industry"),
    "RADIO": ("Music", "music-history-events"),
    "RADIO HEROES": ("Music", "music-history-events"),
    "'60s SONGS": ("Music", "contemporary-pop-culture"),
    "BAND LINEUPS": ("Music", "band-lineups"),
    "MUSICALS": ("Music", "music-history-events"),
    "NASHVILLE": ("Music", "contemporary-pop-culture"),

    # ===== TELEVISION =====
    "TELEVISION": ("Television", "drama-cable"),
    "TV TRIVIA": ("Television", "drama-cable"),
    "SITCOMS": ("Television", "sitcoms-comedy"),
    "SIT-COMS": ("Television", "sitcoms-comedy"),
    "SITCOM SAYINGS": ("Television", "sitcoms-comedy"),
    "TV FAMILIES": ("Television", "sitcoms-comedy"),
    "TV COPS": ("Television", "drama-cable"),
    "TV DETECTIVES": ("Television", "drama-cable"),
    "TV ANIMALS": ("Television", "animated-series"),
    "TV TRADEMARKS": ("Television", "drama-cable"),
    "SOAP OPERAS": ("Television", "drama-cable"),
    "THE EMMYS": ("Television", "drama-cable"),
    "DRAMA": ("Television", "drama-cable"),
    "SHOW BUSINESS": ("Television", "drama-cable"),
    "VAUDEVILLE": ("Television", "drama-cable"),
    "'50'S TV": ("Television", "sitcoms-comedy"),
    "'50s TV": ("Television", "sitcoms-comedy"),
    "'60s TRIVIA": ("Television", "drama-cable"),
    "'40s TRIVIA": ("Television", "drama-cable"),
    "ANIMATED SERIES": ("Television", "animated-series"),
    "REALITY TV": ("Television", "reality-competition"),
    "LATE NIGHT": ("Television", "snl-late-night-recent"),
    "SATURDAY NIGHT LIVE": ("Television", "snl-late-night-recent"),
    "GAME SHOWS": ("Television", "reality-competition"),

    # ===== NEW: FOOD & DRINK =====
    "FOOD": ("Food & Drink", "international-cuisine"),
    "FOOD & DRINK": ("Food & Drink", "international-cuisine"),
    "WORLD OF FOOD": ("Food & Drink", "international-cuisine"),
    "FOREIGN CUISINE": ("Food & Drink", "international-cuisine"),
    "POTENT POTABLES": ("Food & Drink", "beverages-cocktails"),
    "WINES": ("Food & Drink", "beverages-cocktails"),
    "BEER": ("Food & Drink", "beverages-cocktails"),
    "COCKTAILS": ("Food & Drink", "beverages-cocktails"),
    "SWEETS": ("Food & Drink", "ingredients-cooking"),
    "CANDY": ("Food & Drink", "ingredients-cooking"),
    "FRUIT": ("Food & Drink", "ingredients-cooking"),
    "CHOCOLATE": ("Food & Drink", "ingredients-cooking"),
    "HERBS & SPICES": ("Food & Drink", "ingredients-cooking"),
    "SOUPS": ("Food & Drink", "international-cuisine"),
    "SANDWICHES": ("Food & Drink", "international-cuisine"),
    "BREAKFAST": ("Food & Drink", "international-cuisine"),
    "DESSERTS": ("Food & Drink", "international-cuisine"),
    "BAKING": ("Food & Drink", "ingredients-cooking"),
    "COOKING": ("Food & Drink", "ingredients-cooking"),
    "RESTAURANTS": ("Food & Drink", "international-cuisine"),
    "FAST FOOD": ("Food & Drink", "international-cuisine"),

    # ===== NEW: RELIGION & MYTHOLOGY =====
    "RELIGION": ("Religion & Mythology", "world-religions"),
    "THE BIBLE": ("Religion & Mythology", "world-religions"),
    "OLD TESTAMENT": ("Religion & Mythology", "world-religions"),
    "MYTHOLOGY": ("Religion & Mythology", "mythology-folklore"),
    "ANCIENT LEGENDS": ("Religion & Mythology", "mythology-folklore"),
    "SAINTS": ("Religion & Mythology", "world-religions"),
    "SAINTLY CITIES": ("Religion & Mythology", "world-religions"),
    "THE ZODIAC": ("Religion & Mythology", "mythology-folklore"),
    "ASTROLOGY": ("Religion & Mythology", "mythology-folklore"),
    "SUPERSTITIONS": ("Religion & Mythology", "mythology-folklore"),
    "WITCHCRAFT": ("Religion & Mythology", "mythology-folklore"),
    "RITUALS": ("Religion & Mythology", "world-religions"),

    # ===== NEW: LANGUAGE & WORDS =====
    "FOREIGN PHRASES": ("Language & Words", "foreign-words"),
    "FOREIGN WORDS": ("Language & Words", "foreign-words"),
    "ABBREVIATIONS": ("Language & Words", "word-play"),
    "ACRONYMS": ("Language & Words", "word-play"),
    "PALINDROMES": ("Language & Words", "word-play"),
    "ALPHABET SOUP": ("Language & Words", "word-play"),
    "THE ALPHABET": ("Language & Words", "word-play"),
    "4-LETTER WORDS": ("Language & Words", "word-play"),
    "3-LETTER WORDS": ("Language & Words", "word-play"),
    "5-LETTER WORDS": ("Language & Words", "word-play"),
    "6-LETTER WORDS": ("Language & Words", "word-play"),
    "10-LETTER WORDS": ("Language & Words", "word-play"),
    "11-LETTER WORDS": ("Language & Words", "word-play"),
    "12-LETTER WORDS": ("Language & Words", "word-play"),
    "13-LETTER WORDS": ("Language & Words", "word-play"),
    "14-LETTER WORDS": ("Language & Words", "word-play"),
    "15-LETTER WORDS": ("Language & Words", "word-play"),
    "2-LETTER WORDS": ("Language & Words", "word-play"),
    "A.K.A.": ("Language & Words", "word-play"),
    "NICKNAMES": ("Language & Words", "word-play"),
    "PROVERBS": ("Language & Words", "sayings-idioms"),
    "HOMOPHONES": ("Language & Words", "word-play"),
    "SYNONYMS": ("Language & Words", "word-play"),
    "ANTONYMS": ("Language & Words", "word-play"),

    # ===== NEW: BUSINESS & ECONOMICS =====
    "BUSINESS & INDUSTRY": ("Business & Economics", "business-history"),
    "WALL ST.": ("Business & Economics", "business-history"),
    "ECONOMICS": ("Business & Economics", "business-history"),
    "TAX FACTS": ("Business & Economics", "business-history"),
    "ADVERTISING": ("Business & Economics", "business-history"),
    "AUTO SLOGANS": ("Business & Economics", "business-history"),
    "AUTOMOBILES": ("Business & Economics", "business-history"),
    "THE AUTOMOBILE": ("Business & Economics", "business-history"),
    "AUTO REPAIR": ("Business & Economics", "business-history"),
    "RAILROADS": ("Business & Economics", "business-history"),
    "TRAINS": ("Business & Economics", "business-history"),
    "TRANSPORTATION": ("Business & Economics", "business-history"),
    "AVIATION": ("Business & Economics", "business-history"),
    "SHIPS": ("Business & Economics", "business-history"),
    "TRADE CENTERS": ("Business & Economics", "business-history"),
    "NEWSPAPERS": ("Business & Economics", "business-history"),
    "THE PRESS": ("Business & Economics", "business-history"),
    "PUBLISHING": ("Business & Economics", "business-history"),
    "ADDRESSES": ("Business & Economics", "business-history"),

    # ===== NEW: PSYCHOLOGY & PHILOSOPHY =====
    "PSYCHOLOGY": ("Psychology & Philosophy", "psychology"),
    "PHILOSOPHY": ("Psychology & Philosophy", "philosophy"),
    "POP PSYCHOLOGY": ("Psychology & Philosophy", "psychology"),
    "PARAPSYCHOLOGY": ("Psychology & Philosophy", "psychology"),
    "THE MIND": ("Psychology & Philosophy", "psychology"),
    "THE BRAIN": ("Psychology & Philosophy", "psychology"),

    # ===== NEW: GENERAL / MISC =====
    "TRIVIA": ("General Knowledge", "general-trivia"),
    "POTPOURRI": ("General Knowledge", "general-trivia"),
    "POT LUCK": ("General Knowledge", "general-trivia"),
    "POT CLUCK": ("General Knowledge", "general-trivia"),
    "TOSS-UPS": ("General Knowledge", "general-trivia"),
    "TOUGH TRIVIA": ("General Knowledge", "general-trivia"),
    "ODD JOBS": ("General Knowledge", "general-trivia"),
    "TESTS": ("General Knowledge", "general-trivia"),
    "SURVEYS": ("General Knowledge", "general-trivia"),
    "TRENDS": ("General Knowledge", "general-trivia"),
    "NOSTALGIA": ("General Knowledge", "general-trivia"),
    "COLLECTIBLES": ("General Knowledge", "general-trivia"),
    "HOBBIES": ("General Knowledge", "general-trivia"),
    "TOYS & GAMES": ("General Knowledge", "toys-games"),
    "TOYS AND GAMES": ("General Knowledge", "toys-games"),
    "THE BIG TOP": ("General Knowledge", "toys-games"),
    "THE CIRCUS": ("General Knowledge", "toys-games"),
    "COLORS": ("General Knowledge", "general-trivia"),
    "POP QUIZ": ("General Knowledge", "general-trivia"),
    "SEVENS": ("General Knowledge", "general-trivia"),
    "ALL NUMBERS": ("General Knowledge", "general-trivia"),
    "THE WORLD": ("General Knowledge", "general-trivia"),
    "THE NEWS": ("General Knowledge", "general-trivia"),
    "IN THE NEWS": ("General Knowledge", "general-trivia"),
    "PEOPLE": ("General Knowledge", "general-trivia"),
    "WARNINGS": ("General Knowledge", "general-trivia"),
    "SIGNS": ("General Knowledge", "general-trivia"),
    "SIBLINGS": ("General Knowledge", "general-trivia"),
    "TWINS": ("General Knowledge", "general-trivia"),
    "RELATIVES": ("General Knowledge", "general-trivia"),
    "PARTNERS": ("General Knowledge", "general-trivia"),
    "SIDEKICKS": ("General Knowledge", "general-trivia"),
    "PETS": ("General Knowledge", "general-trivia"),
    "BABY CARE": ("General Knowledge", "general-trivia"),
    "SLEEP": ("General Knowledge", "general-trivia"),
    "SMOKING": ("General Knowledge", "general-trivia"),
    "PUNISHMENT": ("General Knowledge", "general-trivia"),
    "PUNISHMENTS": ("General Knowledge", "general-trivia"),
    "PRISONS": ("General Knowledge", "general-trivia"),
    "SCHOOL DAYS": ("General Knowledge", "general-trivia"),
    "SOCIAL STUDIES": ("General Knowledge", "general-trivia"),
    "THE HOME": ("General Knowledge", "general-trivia"),
    "AROUND THE HOUSE": ("General Knowledge", "general-trivia"),
    "HOUSEHOLD ITEMS": ("General Knowledge", "general-trivia"),
    "PHOTOGRAPHY": ("General Knowledge", "general-trivia"),
    "PLASTICS": ("General Knowledge", "general-trivia"),
    "MONTHS": ("General Knowledge", "general-trivia"),
    "AUGUST": ("General Knowledge", "general-trivia"),
    "OCTOBER": ("General Knowledge", "general-trivia"),
    "HOLIDAYS": ("General Knowledge", "general-trivia"),
    "THANKSGIVING": ("General Knowledge", "general-trivia"),
    "HALLOWEEN": ("General Knowledge", "general-trivia"),
    "CHRISTMAS": ("General Knowledge", "general-trivia"),
    "NEW YEAR'S": ("General Knowledge", "general-trivia"),
    "EASTER": ("General Knowledge", "general-trivia"),
    "BIRTHDAYS": ("General Knowledge", "general-trivia"),
    "WEDDINGS": ("General Knowledge", "general-trivia"),
    "FUNERALS": ("General Knowledge", "general-trivia"),
    "ETIQUETTE": ("General Knowledge", "general-trivia"),
    "MANNERS": ("General Knowledge", "general-trivia"),

    # ===== ADDITIONAL DECADES & YEAR CATEGORIES =====
    "THE '40S": ("History & Government", "cultural-social-history"),
    "THE '50S": ("History & Government", "cultural-social-history"),
    "THE '60S": ("History & Government", "cultural-social-history"),
    "THE '70S": ("History & Government", "cultural-social-history"),
    "THE '80S": ("History & Government", "cultural-social-history"),
    "THE '90S": ("History & Government", "cultural-social-history"),
    "1789": ("History & Government", "cultural-social-history"),
    "1885": ("History & Government", "cultural-social-history"),
    "1492": ("History & Government", "cultural-social-history"),

    # ===== ADDITIONAL MISCELLANEOUS CATEGORIES =====
    "ACTORS & ROLES": ("Movies", "actors-performers"),
    "BARBARAS": ("Movies", "actors-performers"),
    "NICK NAMES": ("General Knowledge", "general-trivia"),
    '"NICK" NAMES': ("General Knowledge", "general-trivia"),
    "UNREAL ESTATE": ("General Knowledge", "general-trivia"),
    "UP IN \"ARM\"s": ("General Knowledge", "general-trivia"),
    "USED-UP CARS": ("General Knowledge", "general-trivia"),
    "RACY LADIES": ("General Knowledge", "general-trivia"),
    "WALL TO WALL": ("General Knowledge", "general-trivia"),
    "SHAPING UP": ("General Knowledge", "general-trivia"),
    "SIGHT & SOUND": ("General Knowledge", "general-trivia"),
    "SON OF WOOD": ("General Knowledge", "general-trivia"),
    "STUFFED": ("General Knowledge", "general-trivia"),
    "SUDDEN DEATH": ("General Knowledge", "general-trivia"),
    "THAT'S \"GRAND\"": ("General Knowledge", "general-trivia"),
    "A LA \"CART\"": ("Food & Drink", "international-cuisine"),
    '"CAN" IT': ("General Knowledge", "general-trivia"),
    '"EASY"': ("General Knowledge", "general-trivia"),
    '"HARD"': ("General Knowledge", "general-trivia"),
    '"OLD"': ("General Knowledge", "general-trivia"),
    '"RIGHT"': ("General Knowledge", "general-trivia"),
    '"WRONG"': ("General Knowledge", "general-trivia"),
    '"YOUNG"': ("General Knowledge", "general-trivia"),
    '"FIRST"': ("General Knowledge", "general-trivia"),
    '"LAST"': ("General Knowledge", "general-trivia"),
    '"LITTLE"': ("General Knowledge", "general-trivia"),
    '"BIG"': ("General Knowledge", "general-trivia"),
    '"HARD"': ("General Knowledge", "general-trivia"),
    "P'S & Q'S": ("Language & Words", "word-play"),
    "TRIPLE TALK": ("Language & Words", "word-play"),
    "REVERSE A WORD": ("Language & Words", "word-play"),
    "BEGINS WITH \"L\"": ("Language & Words", "word-play"),
    "BEGINS WITH \"Z\"": ("Language & Words", "word-play"),
    "BEGINS WITH AN \"X\"": ("Language & Words", "word-play"),
    "STARTS WITH \"A\"": ("Language & Words", "word-play"),
    "STARTS WITH \"B\"": ("Language & Words", "word-play"),
    "STARTS WITH \"C\"": ("Language & Words", "word-play"),
    "STARTS WITH \"D\"": ("Language & Words", "word-play"),
    "STARTS WITH \"G\"": ("Language & Words", "word-play"),
    "STARTS WITH \"H\"": ("Language & Words", "word-play"),
    "STARTS WITH \"J\"": ("Language & Words", "word-play"),
    "STARTS WITH \"L\"": ("Language & Words", "word-play"),
    "STARTS WITH \"OO\"": ("Language & Words", "word-play"),
    "STARTS WITH \"P\"": ("Language & Words", "word-play"),
    "STARTS WITH \"Q\"": ("Language & Words", "word-play"),
    "STARTS WITH \"U\"": ("Language & Words", "word-play"),
    "STARTS WITH \"V\"": ("Language & Words", "word-play"),
    "STARTS WITH \"X\"": ("Language & Words", "word-play"),
    "STARTS WITH \"Y\"": ("Language & Words", "word-play"),
    "STARS WITH \"A\"": ("Language & Words", "word-play"),
    '"E" BEFORE "I"': ("Language & Words", "word-play"),
    '"T" TIME': ("Language & Words", "word-play"),
    '"ON" WORDS & "UP" WORDS': ("Language & Words", "word-play"),
    '"IN"s & "OUT"s': ("Language & Words", "word-play"),
    '"DO"s & "DON\'T"s': ("Language & Words", "word-play"),
    '"PRO" & "CON"': ("Language & Words", "word-play"),
    '"UPS" & "DOWNS"': ("Language & Words", "word-play"),
    '"IN" CROWD': ("General Knowledge", "general-trivia"),
    '"THE "IN" CROWD"': ("General Knowledge", "general-trivia"),
    '"THE "PITS"': ("General Knowledge", "general-trivia"),
    '"SHELLS"': ("General Knowledge", "general-trivia"),
    '"NOSE"s': ("General Knowledge", "general-trivia"),
    '"STOPS"': ("General Knowledge", "general-trivia"),
    '"BREAK" IT UP': ("General Knowledge", "general-trivia"),
    '"DAY" NAMES': ("General Knowledge", "general-trivia"),
    '"DAY" TIME': ("General Knowledge", "general-trivia"),
    '"TIME"S': ("General Knowledge", "general-trivia"),
    '"TIN" TYPES': ("General Knowledge", "general-trivia"),
    '"TOASTS"': ("Food & Drink", "beverages-cocktails"),
    '"MONKEY" SHINES': ("General Knowledge", "general-trivia"),
    '"CAT" EGORY': ("General Knowledge", "general-trivia"),
    '"CAT"EGORY': ("General Knowledge", "general-trivia"),
    '"FRED"s': ("General Knowledge", "general-trivia"),
    '"FRIDAYS"': ("General Knowledge", "general-trivia"),
    '"GRAHAMS"': ("General Knowledge", "general-trivia"),
    '"SIMON"S': ("General Knowledge", "general-trivia"),
    '"STEVENS"': ("General Knowledge", "general-trivia"),
    '"LEE"S': ("General Knowledge", "general-trivia"),
    '"ANDY"': ("General Knowledge", "general-trivia"),
    '"JACKS" OF ALL TRADES': ("General Knowledge", "general-trivia"),
    '"LORDS" & "LADIES"': ("History & Government", "famous-figures-quotes"),
    '"MARCH" ON': ("General Knowledge", "general-trivia"),
    '"MC" NAMES': ("General Knowledge", "general-trivia"),
    '"MOORE" OR "LES"': ("General Knowledge", "general-trivia"),
    '"MY, MY"': ("General Knowledge", "general-trivia"),
    '"BARBARA"s': ("Movies", "actors-performers"),
    '"BLACK" & "WHITE"': ("General Knowledge", "general-trivia"),
    '"BROWNS"': ("General Knowledge", "general-trivia"),
    '"C" CITIES': ("Geography", "countries-capitals-borders"),
    '"I" LANDS': ("Geography", "physical-geography"),
    '"V" CITIES': ("Geography", "countries-capitals-borders"),
    '"STATE" NAMES': ("Geography", "us-states-quirky"),
    '"ICE" & "SNOW"': ("General Knowledge", "general-trivia"),
    '"AC"/"DC"': ("General Knowledge", "general-trivia"),
    '"AFTER" WORDS': ("Language & Words", "word-play"),
    '"BOOM"S': ("General Knowledge", "general-trivia"),
    '"HO" & "HUM"': ("General Knowledge", "general-trivia"),
    '"WORLDLY GOODS"': ("General Knowledge", "general-trivia"),
    "ON THE \"OUTS\"": ("General Knowledge", "general-trivia"),
    "\"CAT\" EGORY": ("General Knowledge", "general-trivia"),
}

# Keywords to detect categories that need images
IMAGE_KEYWORDS = {
    "flag": "A flag image would help identify the country",
    "map": "A map image would help locate the region",
    "painting": "An image of the artwork would help identify it",
    "portrait": "A portrait image would help identify the person",
    "photo": "A photograph would help identify the subject",
    "landmark": "An image of the landmark would help identify it",
    "logo": "A logo image would help identify the brand",
    "stamp": "A stamp image would help identify it",
    "coin": "A coin image would help identify it",
    "symbol": "A symbol image would help identify it",
    "plant": "A plant image would help identify the species",
    "animal": "An animal image would help identify the species",
    "bird": "A bird image would help identify the species",
    "fish": "A fish image would help identify the species",
    "flower": "A flower image would help identify it",
    "tree": "A tree image would help identify it",
    "dinosaur": "A dinosaur illustration would help identify it",
    "flag": "A flag image would help identify the country",
    "coat of arms": "A coat of arms image would help identify it",
    "architecture": "An architectural image would help identify the building",
    "building": "An image of the building would help identify it",
    "bridge": "An image of the bridge would help identify it",
    "statue": "An image of the statue would help identify it",
    "sculpture": "An image of the sculpture would help identify it",
    "costume": "A costume image would help identify it",
    "uniform": "A uniform image would help identify it",
    "instrument": "An instrument image would help identify it",
    "species": "A species image would help identify it",
    "breed": "A breed image would help identify it",
    "rock": "A rock/mineral image would help identify it",
    "mineral": "A mineral image would help identify it",
    "gem": "A gemstone image would help identify it",
    "fossil": "A fossil image would help identify it",
    "anatomy": "An anatomical diagram would help identify it",
    "skeleton": "A skeletal image would help identify it",
    "cell": "A cell diagram would help identify it",
    "molecule": "A molecular diagram would help identify it",
    "element": "A periodic table/visual would help identify it",
    "constellation": "A constellation map would help identify it",
    "planet": "A planetary image would help identify it",
    "car": "A car image would help identify it",
    "airplane": "An airplane image would help identify it",
    "train": "A train image would help identify it",
    "ship": "A ship image would help identify it",
    "weapon": "A weapon image would help identify it",
    "flag": "A flag image would help identify it",
    "emblem": "An emblem image would help identify it",
}

# Jeopardy category names that are purely wordplay/gimmick (no real trivia content)
WORDPLAY_CATEGORIES = {
    "4-LETTER WORDS", "3-LETTER WORDS", "5-LETTER WORDS", "6-LETTER WORDS",
    "10-LETTER WORDS", "11-LETTER WORDS", "12-LETTER WORDS", "13-LETTER WORDS",
    "14-LETTER WORDS", "15-LETTER WORDS", "2-LETTER WORDS",
    "BEGINS WITH \"L\"", "BEGINS WITH \"Z\"", "BEGINS WITH AN \"X\"",
    "STARTS WITH \"A\"", "STARTS WITH \"B\"", "STARTS WITH \"C\"",
    "STARTS WITH \"D\"", "STARTS WITH \"G\"", "STARTS WITH \"H\"",
    "STARTS WITH \"J\"", "STARTS WITH \"L\"", "STARTS WITH \"OO\"",
    "STARTS WITH \"P\"", "STARTS WITH \"Q\"", "STARTS WITH \"U\"",
    "STARTS WITH \"V\"", "STARTS WITH \"X\"", "STARTS WITH \"Y\"",
    "STARS WITH \"A\"", "\"E\" BEFORE \"I\"",
    "PALINDROMES", "REVERSE A WORD", "HOMOPHONES", "SYNONYMS", "ANTONYMS",
    "P'S & Q'S", "TRIPLE TALK", "ALPHABET SOUP", "THE ALPHABET",
    "\"T\" TIME", "\"ON\" WORDS & \"UP\" WORDS", "\"IN\"s & \"OUT\"s",
    "\"DO\"s & \"DON'T\"s", "\"PRO\" & \"CON\"", "\"UPS\" & \"DOWNS\"",
    "\"AFTER\" WORDS", "ABBREVIATIONS", "ACRONYMS",
    "NUMBER PLEASE", "NUMBER, PLEASE", "ALL NUMBERS", "NUMBERS",
}

# Categories likely to contain extremely dated pop culture references (1984-specific)
DATED_POP_CULTURE_CATEGORIES = {
    "\'50'S TV", "\'50s TV", "\'60s SONGS", "\'60s TRIVIA", "\'40s TRIVIA",
    "\'30s MOVIES", "VAUDEVILLE", "RADIO HEROES", "SOAP OPERAS",
    "SITCOMS", "SIT-COMS", "SITCOM SAYINGS", "TV FAMILIES", "TV COPS",
    "TV DETECTIVES", "TV ANIMALS", "TV TRADEMARKS",
    "SILLY SONGS", "PRISON SONGS", "PROTEST SONGS", "SONGS OF WAR",
    "SWEET SONGS", "\"BLUE\" SONGS", "\"BOYS\" IN SONG", "\"DREAM\"Y MUSIC",
    "\"GOOD\" MUSIC", "TRAVELIN' TUNES",
    "NURSERY RHYMES", "\"MONKEY\" SHINES",
}

# Insensitive/outdated terminology to flag
INSENSITIVE_PATTERNS = [
    r'\boriental\b', r'\bnegro\b', r'\bcolored\b', r'\bsavage\b',
    r'\bprimitive\b', r'\bheathen\b', r'\bpygmy\b', r'\beskimo\b',
    r'\bredskin\b', r'\bthe indians\b', r'\bwild (men|women)\b',
    r'\bmidget\b', r'\bcripple\b', r'\binsane\b', r'\blunatic\b',
    r'\bidiot\b', r'\bretard\b', r'\bimbecile\b', r'\bmoron\b',
    r'\bqueer\b', r'\bhomosexual\b.*\b(perversion|disorder|disease)\b',
    r'\bgypsy\b', r'\bchink\b', r'\bgook\b', r'\bwop\b', r'\bdago\b',
    r'\bkike\b', r'\bspic\b', r'\bwetback\b', r'\bjap\b',
    r'\bfemale\s+(driver|doctor|lawyer|boss)\b',
    r'\bwife\s*beating\b', r'\bbattered\s+wife\b',
]

# Facts that may have changed since 1984
FACTS_THAT_CHANGED_PATTERNS = [
    r'\btallest\b', r'\blongest\b', r'\bbiggest\b', r'\blargest\b',
    r'\bfastest\b', r'\bsmallest\b', r'\bhighest\b', r'\bdeepest\b',
    r'\boldest\b', r'\bnewest\b', r'\bmost\s+(\w+\s+){0,2}(goals|points|touchdowns|home\s*runs|gold|medals|titles|championships)\b',
    r'\bcurrent\s+(\w+\s+){0,2}(president|prime\s*minister|champion|record|leader)\b',
    r'\brecord\s+(\w+\s+){0,2}(holder|breaker)\b',
    r'\bfirst\s+(\w+\s+){0,2}(woman|african|black|hispanic)\s+(\w+\s+){0,2}(president|ceo|senator|governor|mayor)\b',
    r'\bpopulation\s+of\b', r'\bworth\s+\$', r'\bvalue\s+at\b',
]


def assess_suitability(clue_text, correct_response, jeop_category, air_date):
    """
    Assess whether a Jeopardy question is suitable for modern Live Trivia use.
    Returns a list of flag reasons (empty list = suitable).
    """
    flags = []
    combined = (clue_text + " " + correct_response).lower()

    # 1. Wordplay/gimmick categories
    if jeop_category in WORDPLAY_CATEGORIES:
        flags.append("wordplay-gimmick: category is a word puzzle, not trivia content")

    # 2. Dated pop culture
    if jeop_category in DATED_POP_CULTURE_CATEGORIES:
        flags.append("dated-reference: category is tied to 1980s pop culture or earlier")

    # 3. Potentially insensitive content
    for pattern in INSENSITIVE_PATTERNS:
        if re.search(pattern, combined):
            flags.append(f"potentially-insensitive: contains outdated/insensitive terminology")

    # 4. Facts that may have changed
    for pattern in FACTS_THAT_CHANGED_PATTERNS:
        if re.search(pattern, combined):
            flags.append("fact-may-have-changed: superlatives/records likely outdated since 1984")
            break  # only flag once for this category

    # 5. Questions about current events from 1984
    if air_date and air_date.startswith("1984"):
        current_event_indicators = [
            r'\bcurrent\b', r'\brecent\b', r'\blast\s+year\b', r'\bthis\s+years\b',
            r'\blatest\b', r'\bnew\s+\w+\s+(law|policy|act|program)\b',
            r'\b1984\b', r'\b1985\b',
            r'\btoday\'s\b',
        ]
        for pattern in current_event_indicators:
            if re.search(pattern, combined):
                flags.append("dated-reference: current-event question from 1984")
                break

    # 6. Questions where the answer is a dollar amount, year range, or very specific number
    # (often these are gimmicky or too specific)
    response = correct_response.strip().lower()
    if re.match(r'^\$[\d,]+$', response):
        flags.append("gimmick: answer is a dollar amount")

    return flags


def rephrase_question(clue_text, correct_response):
    """
    Rephrase a Jeopardy! clue into a proper direct question for Live Trivia.

    In the J! Archive TSV format:
      - 'answer' column = the clue text (what the host reads)
      - 'question' column = the correct response (what contestants say)

    Jeopardy clues are declarative statements. Converts them to interrogative form
    matching the style of existing Live Trivia database questions:
      "Which country is the largest in the world...?"
      "Who was the first official emperor...?"
      "In what year was the Magna Carta signed?"
      "What gas do plants absorb...?"
    """
    q = clue_text.strip()
    original_q = q  # keep for debugging

    # If it already looks like a question, leave it as-is
    if q.endswith("?") or q.startswith(("Who", "What", "Where", "When", "Why", "How", "Which")):
        return q

    response = correct_response.strip()
    response_lower = response.lower()

    # Fix escaped quotes and special characters early
    q = q.replace('\\"', '"')
    q = q.replace("\\'", "'")

    # Fix parenthetical pluralization markers: "temple(s)" -> "temple or temples"
    q = re.sub(r'(\w+)\(s\)', r'\1(s)', q)  # keep "(s)" marker

    # === Determine what kind of answer the response is ===

    # Person detection
    is_person = False
    for prefix in ["mr.", "mrs.", "ms.", "dr.", "prof.", "st.", "saint"]:
        if response_lower.startswith(prefix):
            is_person = True
            break

    if not is_person:
        first_word = response.split()[0].lower() if response.split() else ""
        person_first_names = {
            "george", "thomas", "john", "james", "william", "henry", "richard",
            "robert", "charles", "joseph", "edward", "david", "michael", "daniel",
            "paul", "peter", "mark", "andrew", "alexander", "benjamin", "samuel",
            "franklin", "theodore", "winston", "adolf", "joseph", "napoleon",
            "abraham", "ulysses", "ronald", "franklin", "martin", "nelson",
            "walt", "oscar", "ernest", "mark", "lev", "franz", "ludwig",
            "wolfgang", "johann", "antonio", "giuseppe", "frederic", "richard",
            "elvis", "bob", "jimi", "mick", "paul", "john", "miles", "duke",
            "mary", "elizabeth", "queen", "prince", "king", "pope",
            "marie", "joan", "florence", "harriet", "rosa", "eleanor",
            "margaret", "indira", "golda", "cleopatra", "nefertiti",
            "marlon", "cary", "humphrey", "clark", "sean", "tom",
            "brad", "leonardo", "johnny", "robert", "al", "jack", "morgan",
            "henry", "sam", "dean", "james", "john", "william", "will",
            "jane", "jules", "julius", "augustus", "constantine", "socrates",
            "plato", "aristotle", "confucius", "buddha", "muhammad", "jesus",
            "mozart", "beethoven", "shakespeare", "dickens", "austin",
            "ernest", "stephen", "jrr", "c.s.", "h.g.", "herman", "jules",
            "leonardo", "michelangelo", "picasso", "van", "rembrandt",
            "monet", "manet", "degas", "renoir", "gauguin", "vangogh",
            "claude", "pablo", "vincent", "salvador", "andy", "jackson",
        }
        if first_word in person_first_names:
            is_person = True

    if not is_person:
        person_last_names = re.search(
            r'\b('
            r'Churchill|Roosevelt|Kennedy|Lincoln|Washington|Einstein|Shakespeare|'
            r'Mozart|Beethoven|Monroe|Presley|Sinatra|Hendrix|Fleming|Edison|'
            r'Darwin|Freud|Marx|Newton|Galileo|Columbus|Magellan|Napoleon|'
            r'Caesar|Augustus|Cleopatra|Gandhi|Mandela|Lenin|Stalin|Hitler|'
            r'Thatcher|Jefferson|Hamilton|Franklin|Reagan|Eisenhower|'
            r'DiCaprio|Hanks|Cruise|Brando|Bogart|Gable|Monroe|Taylor|Hepburn|'
            r'Chaplin|Hemingway|Twain|Dickens|Austen|Tolkien|Rowling|Fitzgerald|'
            r'Picasso|Monet|VanGogh|DaVinci|Michelangelo|Rembrandt|Warhol|'
            r'Jordan|Gretzky|Ali|Ruth|Owens|Phelps|Bolt|Woods|Graham|Nicklaus|'
            r'Moses|Buddha|Muhammad|Confucius|Aristotle|Plato|Socrates|Jesus|'
            r'Freud|Jung|Darwin|Newton|Einstein|Galileo|Bohr|Curie|Pasteur|'
            r'Salk|Fleming|Goodall|Barton|Nightingale|Tubman|Douglass|King|'
            r'Bond|Holmes|Batman|Superman|Spock|Gatsby|Hamlet|Gollum|Potter|'
            r'Columbus|Magellan|Drake|Erikson|Polo|Hudson|Balboa|Vespucci|'
            r'Bach|Beethoven|Mozart|Chopin|Liszt|Verdi|Puccini|Wagner|Brahms|'
            r'Presley|Hendrix|Jagger|Dylan|Springsteen|Jackson|Wonder|Lennon|'
            r'McCartney|Cobain|Bowie|Prince|Madonna|Beyonce|Cash|Nelson|Strauss'
            r')\b',
            response
        )
        if person_last_names:
            is_person = True

    # === Narrow person detection to avoid false positives ===
    # Things named after people (holidays, places, organizations) should not be "Who"
    if is_person:
        not_person_patterns = [
            r'\b(Day|Holiday|Festival|River|Lake|Mountain|Mount|Peak|City|'
            r'Street|Avenue|Road|Park|Hotel|Hospital|University|College|'
            r'School|Museum|Library|Stadium|Airport|Bridge|Tunnel|Square|'
            r'Bay|Island|Isle|Cape|Fort|Port|County|State|Building|Tower|'
            r'Palace|Castle|Church|Cathedral|Temple|Monument|Statue|Prize|'
            r'Award|Medal|Trophy|Cup|Ship|Boat|Train|Car|Brand|Company)\b',
            r'^(the|a|an)\s+',
            r'^["\']',
        ]
        for pattern in not_person_patterns:
            if re.search(pattern, response, re.IGNORECASE):
                is_person = False
                break

    # Is the answer a year or number?
    is_year = bool(re.match(r'^[\$]?(\d{3,4})$', response.strip()))
    # Dollar amounts, percentages, plain numbers
    is_number = bool(re.match(r'^[\d,.]+$', response.replace('$', '').replace('%', '').strip()))
    # Check for "how many" patterns: answer is a number but not a year
    is_countable_number = bool(re.match(r'^\d+$', response.strip())) and not is_year

    # === Detect clue structure type and build proper question ===

    # Save original for fallback
    original_clean = q

    # === STRATEGY 1: Handle common Jeopardy openers ===

    # "This/These [NOUN] [VERB]" -> "Which [NOUN] [VERB]?"
    # Note: rest is NOT capitalized (follows "Which/Who/In what year")
    this_these_match = re.match(r'^(This|These)\s+(.+)', q, re.IGNORECASE)
    if this_these_match:
        rest = this_these_match.group(2)
        if is_person:
            new_q = f"Who {rest}?"
        elif is_year:
            new_q = f"In what year {rest}?"
        else:
            new_q = f"Which {rest}?"
        return new_q

    # "It was [a/an/the] [NOUN] [that/who]..." -> "What/Who was [NOUN]...?"
    it_was_match = re.match(r"^It\s+was\s+(a\s+|an\s+|the\s+)?(.+)", q, re.IGNORECASE)
    if it_was_match:
        rest = it_was_match.group(2)
        # Remove "that/who/which" from start of rest for cleaner output
        rest = re.sub(r'^(that|who|which)\s+', '', rest, flags=re.IGNORECASE)
        if is_person:
            new_q = f"Who was {rest}?"
        else:
            new_q = f"What was {rest}?"
        return new_q

    # "It's [a/an/the] [NOUN]..." -> "What is [NOUN]...?"
    its_match = re.match(r"^It'[s]\s+(a\s+|an\s+|the\s+)?(.+)", q, re.IGNORECASE)
    if its_match:
        rest = its_match.group(2)
        if is_person:
            new_q = f"Who is {rest}?"
        else:
            new_q = f"What is {rest}?"
        return new_q

    # "He's/She's/It's [NOUN/ADJ...]" -> "Who is/What is [NOUN...]?"
    hes_shes_match = re.match(r"^(He'[sS]|She'[sS]|It'[sS])\s+(.+)", q)
    if hes_shes_match:
        pronoun = hes_shes_match.group(1).lower()
        rest = hes_shes_match.group(2)
        if pronoun in ("he's", "she's") or is_person:
            new_q = f"Who is {rest}?"
        else:
            new_q = f"What is {rest}?"
        return new_q

    # "He/She [VERB...]" -> "Who [VERB...]?"
    he_she_match = re.match(r'^(He|She)\s+(.+)', q, re.IGNORECASE)
    if he_she_match:
        rest = he_she_match.group(2)
        new_q = f"Who {rest}?"
        return new_q

    # "His/Her [NOUN...]" -> "Whose [NOUN...]?"
    his_her_match = re.match(r'^(His|Her)\s+(.+)', q, re.IGNORECASE)
    if his_her_match:
        rest = his_her_match.group(2)
        new_q = f"Whose {rest}?"
        return new_q

    # "The [NOUN]..." -> "Which [NOUN]...?" for things, "What is the [NOUN]...?" for definitions
    the_match = re.match(r'^The\s+(.+)', q, re.IGNORECASE)
    if the_match:
        rest = the_match.group(1)
        if is_person:
            new_q = f"Who is the {rest}?"
        elif is_year:
            new_q = f"In what year was the {rest}?"
        elif is_countable_number:
            new_q = f"How many {rest}?"
        else:
            new_q = f"Which {rest}?"
        return new_q

    # "In [YEAR/PERIOD], [SUBJECT] [VERB...]" -> "In [YEAR], what [VERB...]?"
    in_year_match = re.match(r'^In\s+(\d{3,4}s?)\s*,?\s+(.+)', q, re.IGNORECASE)
    if in_year_match:
        year = in_year_match.group(1)
        rest = in_year_match.group(2)
        if is_year:
            new_q = f"In {year}, in what year {rest}?"
        elif is_person:
            new_q = f"In {year}, who {rest}?"
        else:
            new_q = f"In {year}, what {rest}?"
        return new_q

    # === STRATEGY 2: Handle clues based on answer type ===

    # Check if clue starts with a number (like "2 'Saturday Night' alumni...")
    starts_with_number = bool(re.match(r'^\d+\s+', q))

    # Check if clue starts with a be-verb form (is/are/was/were)
    be_forms_map = {"is": "What is", "are": "What are", "was": "What was", "were": "What were"}
    first_word_lower = q.split()[0].lower().strip() if q.split() else ""

    if first_word_lower in be_forms_map:
        remaining = q[len(q.split()[0]):].strip()
        if remaining:
            new_q = f"{be_forms_map[first_word_lower]} {remaining}?"
        else:
            new_q = f"{be_forms_map[first_word_lower]}?"
        return new_q

    # === STRATEGY 3: Build question based on answer type ===

    if is_person:
        # "Who [verb] [rest]?"
        new_q = f"Who {q[0].lower()}{q[1:]}?"
        # Fix awkward "Who is/was/are" at start if the clue already starts with a verb
        first_word = q.split()[0].lower() if q.split() else ""
        if first_word in {"being", "doing", "having", "making", "calling",
                          "known", "called", "named", "considered"}:
            # "Who known as..." -> "Who is known as..."
            new_q = f"Who is {q[0].lower()}{q[1:]}?"
        return new_q

    if is_year:
        # "In what year [verb] [rest]?"
        new_q = f"In what year {q[0].lower()}{q[1:]}?"
        return new_q

    if is_countable_number:
        # Check if the question is asking about a quantity
        number_keywords = ["number", "total", "amount", "count", "how many"]
        q_lower = q.lower()
        if any(kw in q_lower for kw in number_keywords):
            # "Number of red stripes..." -> "How many red stripes are on the US flag?"
            # This is complex - just use "What is the" prefix for noun phrases
            new_q = f"What is the {q[0].lower()}{q[1:]}?"
        else:
            new_q = f"What {q[0].lower()}{q[1:]}?"
        return new_q

    if is_number and not is_countable_number:
        new_q = f"What {q[0].lower()}{q[1:]}?"
        return new_q

    # === STRATEGY 4: Generic fallback with grammar improvement ===

    # Detect if the clue is a noun phrase (no main verb):
    # Common verb-like words that indicate a full sentence
    verb_indicators = {
        "is", "are", "was", "were", "has", "have", "had", "do", "does", "did",
        "can", "could", "will", "would", "shall", "should", "may", "might",
        "became", "become", "called", "known", "named", "considered",
        "lives", "lived", "works", "worked", "runs", "ran", "goes", "went",
        "says", "said", "makes", "made", "takes", "took", "gives", "gave",
        "gets", "got", "finds", "found", "shows", "showed", "means", "meant",
        "comes", "came", "begins", "began", "starts", "started",
    }

    first_word = q.split()[0].lower() if q.split() else ""
    second_word = q.split()[1].lower() if len(q.split()) > 1 else ""

    # If starts with a possessive or adjective-like noun followed by non-verb
    # it's likely a noun phrase needing "What is"
    if (len(q.split()) >= 2 and second_word not in verb_indicators
        and first_word not in verb_indicators
        and not starts_with_number):
        # Likely a noun phrase like "Scottish word for lake"
        # -> "What is the Scottish word for lake?"
        # or "Marconi's wonderful wireless" -> "What was Marconi's wonderful wireless called?"
        # Use "What is" as default for present-tense, "What was" for past
        if any(past_word in q.lower() for past_word in
               ["was", "were", "in the 19", "in the 18", "in the 17",
                "ancient", "medieval", "former", "historical",
                "died", "born", "invented", "discovered", "created",
                "founded", "built", "wrote", "painted", "composed"]):
            new_q = f"What was {q[0].lower()}{q[1:]}?"
        else:
            new_q = f"What is the {q[0].lower()}{q[1:]}?"
    else:
        # Has a verb or starts with a number - likely a full sentence
        new_q = f"What {q[0].lower()}{q[1:]}?"

    # Ensure proper capitalization
    new_q = new_q[0].upper() + new_q[1:]

    # Fix common artifacts
    new_q = re.sub(r'^What is the a\s+', 'What is the ', new_q)
    new_q = re.sub(r'^What is the an?\s+', 'What is the ', new_q)
    new_q = re.sub(r'^What a\s+', 'What was the name of the ', new_q)
    new_q = re.sub(r'^What an?\s+', 'What was the name of the ', new_q)

    # If it doesn't end with ?, add it
    if not new_q.endswith("?"):
        new_q += "?"

    return new_q


def generate_slug(question, answer, category, subcategory):
    """
    Generate a URL-friendly slug from the question content.
    """
    # Extract key terms from the question
    text = question + " " + answer
    # Remove punctuation, lowercase
    text = re.sub(r'[^\w\s]', ' ', text)
    text = text.lower().strip()

    # Take first ~6 meaningful words
    words = text.split()
    # Remove common stop words at the beginning
    stop_words = {'what', 'which', 'who', 'where', 'when', 'why', 'how', 'is', 'are',
                  'was', 'were', 'did', 'does', 'do', 'has', 'have', 'had', 'the',
                  'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'by', 'with'}
    filtered = [w for w in words if w not in stop_words]

    # Take up to 6 words for the slug
    slug_words = filtered[:6]
    if not slug_words:
        slug_words = words[:6]

    slug = '-'.join(slug_words)

    # Remove any non-alphanumeric characters except hyphens
    slug = re.sub(r'[^a-z0-9-]', '', slug)

    # Limit length
    if len(slug) > 80:
        slug = slug[:80].rstrip('-')

    # Ensure uniqueness by appending a hash if needed
    return slug


def needs_image(clue, answer, category):
    """
    Determine if a question would benefit from an image.
    Returns (bool, reason) tuple.
    """
    combined = (clue + " " + answer).lower()

    # Categories that frequently need images
    image_categories = {
        "Geography": {
            "map-identification": ("A map image would help identify the location", 0.9),
            "physical-geography": ("A map or geographic image would help", 0.6),
            "landmarks-wonders": ("An image of the landmark would help identify it", 0.8),
            "countries-capitals-borders": ("A map or flag image would help identify the country", 0.7),
            "us-states-quirky": ("A map image would help identify the state", 0.7),
        }
    }

    # Check specific subcategories
    for cat_key, subcats in image_categories.items():
        if category[0] == cat_key:
            for subcat, (reason, confidence) in subcats.items():
                if category[1] == subcat:
                    return True, reason

    # Check for specific image-worthy keywords in the clue
    high_confidence_keywords = [
        (r'\bflag\b', "A flag image would help identify the country"),
        (r'\bportrait\b', "A portrait image would help identify the person"),
        (r'\bpainting\b', "An image of the painting would help identify it"),
        (r'\bsculpture\b', "An image of the sculpture would help identify it"),
        (r'\bstatue\b', "An image of the statue would help identify it"),
        (r'\blandmark\b', "An image of the landmark would help identify it"),
        (r'\bbuilding\b', "An image of the building would help identify it"),
        (r'\bbridge\b', "An image of the bridge would help identify it"),
        (r'\bmountain\b', "An image of the mountain would help identify it"),
        (r'\briver\b', "A map image would help identify the river"),
        (r'\bisland\b', "A map image would help identify the island"),
        (r'\blake\b', "A map image would help identify the lake"),
        (r'\bdesert\b', "An image of the desert would help identify it"),
        (r'\bvolcano\b', "An image of the volcano would help identify it"),
        (r'\bwaterfall\b', "An image of the waterfall would help identify it"),
        (r'\bcathedral\b', "An image of the cathedral would help identify it"),
        (r'\bchurch\b', "An image of the church would help identify it"),
        (r'\bpalace\b', "An image of the palace would help identify it"),
        (r'\bmuseum\b', "An image of the museum would help identify it"),
        (r'\bmonument\b', "An image of the monument would help identify it"),
        (r'\btemple\b', "An image of the temple would help identify it"),
        (r'\bpyramid\b', "An image of the pyramid would help identify it"),
        (r'\bcastle\b', "An image of the castle would help identify it"),
        (r'\bfort\b', "An image of the fort would help identify it"),
        (r'\bfossil\b', "An image of the fossil would help identify it"),
        (r'\bdinosaur\b', "A dinosaur illustration would help identify it"),
        (r'\bconstellation\b', "A star chart image would help identify the constellation"),
        (r'\bplanet\b', "An image of the planet would help identify it"),
        (r'\bgalaxy\b', "An image of the galaxy would help identify it"),
        (r'\bnobel\b', "An image of the Nobel Prize medal would help"),
        (r'\bmedal\b', "An image of the medal would help identify it"),
        (r'\btrophy\b', "An image of the trophy would help identify it"),
        (r'\blogo\b', "A logo image would help identify the brand"),
        (r'\bcoat of arms\b', "A coat of arms image would help identify it"),
        (r'\bemblem\b', "An emblem image would help identify it"),
        (r'\bstamp\b', "A stamp image would help identify it"),
        (r'\bcoin\b', "A coin image would help identify it"),
        (r'\bbill\b', "A currency image would help identify it"),
        (r'\bcurrency\b', "A currency image would help identify it"),
        (r'\banatomy\b', "An anatomical diagram would help"),
        (r'\bskeleton\b', "A skeletal diagram would help"),
        (r'\borgan\b', "An organ diagram would help"),
        (r'\bcell\b', "A cell diagram would help"),
        (r'\bbird\b', "A bird image would help identify the species"),
        (r'\bfish\b', "A fish image would help identify it"),
        (r'\bsnake\b', "A snake image would help identify it"),
        (r'\bwhale\b', "A whale image would help identify it"),
        (r'\bbutterfly\b', "A butterfly image would help identify it"),
        (r'\bbear\b', "A bear image would help identify it"),
        (r'\bflower\b', "A flower image would help identify it"),
        (r'\btree\b', "A tree image would help identify it"),
        (r'\bmineral\b', "A mineral image would help identify it"),
        (r'\bgem\b', "A gemstone image would help identify it"),
        (r'\bcrystal\b', "A crystal image would help identify it"),
        (r'\bperiodic\b', "A periodic table image would help"),
        (r'\bmolecule\b', "A molecular diagram would help"),
        (r'\bflag of\b', "A flag image would help identify the country"),
        (r'\bpresident\b.*\bportrait\b', "A presidential portrait would help"),
        (r'\bmoon\b', "An image of the moon would help"),
        (r'\bmap\b', "A map image would help identify the location"),
        (r'\bglobe\b', "A globe image would help"),
        (r'\bearth\b', "A satellite image of Earth would help"),
    ]

    for pattern, reason in high_confidence_keywords:
        if re.search(pattern, combined):
            return True, reason

    return False, ""


def determine_difficulty(clue_value):
    """
    Map Jeopardy! dollar values to difficulty levels.
    Jeopardy!: $100-$200 = easy, $300-$600 = medium, $800-$1000 = hard
    Final Jeopardy (round 3) = hard
    """
    clue_value = int(clue_value) if clue_value else 0
    if clue_value <= 200:
        return "easy"
    elif clue_value <= 600:
        return "medium"
    else:
        return "hard"


def build_acceptable_answers(answer_text):
    """
    Parse acceptable answers from the Jeopardy answer field.
    The answer may contain alternatives in parentheses or after 'or'.
    """
    answer = answer_text.strip()
    acceptable = [answer]

    # Check for parenthetical alternatives
    paren_match = re.search(r'\(([^)]+)\)', answer)
    if paren_match:
        alt = paren_match.group(1).strip()
        if alt and alt.lower() not in ('s', 'es', 'ed', 'ing'):
            acceptable.append(alt)

    # Check for "or" alternatives
    or_parts = re.split(r'\s+or\s+', answer)
    if len(or_parts) > 1:
        for part in or_parts[1:]:
            part = part.strip().rstrip(')').strip()
            if part:
                acceptable.append(part)

    return acceptable


def process_tsv():
    """Main processing function."""
    print(f"Reading {TSV_PATH}...")

    # Read the TSV
    rows = []
    with open(TSV_PATH, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter='\t')
        for row in reader:
            rows.append(row)

    print(f"Loaded {len(rows)} questions.")

    # Organize output by Live Trivia category
    output_by_category = defaultdict(list)
    unmapped = []
    mapped_count = 0
    image_count = 0
    flagged_count = 0

    for i, row in enumerate(rows):
        if (i + 1) % 1000 == 0:
            print(f"Processing question {i+1}/{len(rows)}...")

        jeop_category = row['category'].strip()
        # J! Archive TSV: 'answer' column = clue text, 'question' column = correct response
        clue_text = row['answer'].strip()
        correct_response = row['question'].strip()
        clue_value = row.get('clue_value', '0')
        air_date = row.get('air_date', '')

        # Map to Live Trivia category
        mapping = CATEGORY_MAP.get(jeop_category)
        if mapping is None:
            unmapped.append((jeop_category, clue_text, correct_response))
            continue

        live_cat, subcat = mapping
        mapped_count += 1

        # Rephrase the clue
        rephrased = rephrase_question(clue_text, correct_response)

        # Generate slug
        slug = generate_slug(rephrased, correct_response, live_cat, subcat)

        # Determine difficulty
        difficulty = determine_difficulty(clue_value)

        # Build acceptable answers
        acceptable = build_acceptable_answers(correct_response)

        # Check if image is needed
        has_image_need, image_reason = needs_image(clue_text, correct_response, (live_cat, subcat))
        if has_image_need:
            image_count += 1

        # Assess suitability
        flags = assess_suitability(clue_text, correct_response, jeop_category, air_date)
        if flags:
            flagged_count += 1

        # Build the question object
        question_obj = {
            "slug": slug,
            "question": rephrased,
            "answer": correct_response,
            "category": live_cat,
            "difficulty": difficulty,
            "subcategory": subcat,
            "jeopardy_category": jeop_category,
            "jeopardy_clue": clue_text,
            "air_date": air_date,
        }

        if len(acceptable) > 1:
            question_obj["acceptableAnswers"] = acceptable

        if has_image_need:
            question_obj["needs_image"] = True
            question_obj["image_reason"] = image_reason

        if flags:
            question_obj["flags"] = flags

        # Skip flagged questions (keep output clean)
        if not flags:
            output_by_category[live_cat].append(question_obj)

    clean_count = mapped_count - flagged_count
    print(f"\nProcessing complete!")
    print(f"  Mapped: {mapped_count}")
    print(f"  Flagged & removed: {flagged_count}")
    print(f"  Kept in output: {clean_count}")
    print(f"  Image candidates: {image_count}")
    print(f"  Unmapped: {len(unmapped)}")

    # Write output files
    print(f"\nWriting output files...")
    for cat_name, questions in sorted(output_by_category.items()):
        # Sanitize filename
        safe_name = cat_name.lower().replace(' & ', '-').replace(' ', '-').replace(',', '')
        filename = f"jeopardy-{safe_name}.json"
        filepath = os.path.join(OUT_DIR, filename)

        output = {
            "categoryName": cat_name,
            "source": "Jeopardy! Season 1",
            "question_count": len(questions),
            "questions": questions,
        }

        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(output, f, indent=2, ensure_ascii=False)

        print(f"  {filename}: {len(questions)} questions")

    # Write unmapped categories report
    if unmapped:
        unmapped_path = os.path.join(OUT_DIR, "jeopardy-unmapped-categories.json")
        unmapped_data = defaultdict(list)
        for cat, clue, answer in unmapped:
            unmapped_data[cat].append({"clue": clue, "answer": answer})

        # Summarize
        unmapped_summary = []
        for cat, items in sorted(unmapped_data.items()):
            unmapped_summary.append({
                "jeopardy_category": cat,
                "count": len(items),
                "examples": items[:3],
            })

        with open(unmapped_path, 'w', encoding='utf-8') as f:
            json.dump(unmapped_summary, f, indent=2, ensure_ascii=False)
        print(f"\n  Unmapped categories report: {unmapped_path}")
        print(f"  Total unmapped categories: {len(unmapped_data)}")

    # Summary
    print(f"\n{'='*60}")
    print(f"SUMMARY")
    print(f"{'='*60}")
    for cat_name, questions in sorted(output_by_category.items()):
        print(f"  {cat_name}: {len(questions)} questions")
    print(f"  Total flagged & removed: {flagged_count}")
    print(f"  Total kept in output: {clean_count}")
    print(f"  Total image candidates: {image_count}")
    print(f"  Total unmapped: {len(unmapped)}")
    print(f"\nOutput directory: {OUT_DIR}")


if __name__ == "__main__":
    process_tsv()
