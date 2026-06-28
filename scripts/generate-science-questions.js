const fs = require('fs');

// Generate 98 new Science & Tech questions following Rigid Identifier rules
// Organized by subcategory to match existing schema

const questions = [];

// ===== biology-human-body (20 questions) =====
const biology = [
  {
    slug: "heart-upper-chambers",
    question: "What are the two upper chambers of the human heart called?",
    answer: "Atria",
    acceptableAnswers: ["Atrium"],
    difficulty: "medium",
    subcategory: "biology-human-body"
  },
  {
    slug: "genetic-information-molecule",
    question: "What molecule stores genetic information in all living cells?",
    answer: "DNA",
    acceptableAnswers: ["Deoxyribonucleic acid"],
    difficulty: "easy",
    subcategory: "biology-human-body"
  },
  {
    slug: "eye-light-sensitive-layer",
    question: "What light-sensitive layer of tissue lines the back of the human eye?",
    answer: "Retina",
    acceptableAnswers: [],
    difficulty: "easy",
    subcategory: "biology-human-body"
  },
  {
    slug: "medical-name-windpipe",
    question: "What is the medical name for the windpipe?",
    answer: "Trachea",
    acceptableAnswers: [],
    difficulty: "easy",
    subcategory: "biology-human-body"
  },
  {
    slug: "fetal-nourishment-organ",
    question: "What organ develops during pregnancy to nourish a fetus?",
    answer: "Placenta",
    acceptableAnswers: [],
    difficulty: "easy",
    subcategory: "biology-human-body"
  },
  {
    slug: "eye-transparent-layer",
    question: "What transparent part of the eye covers the iris and pupil?",
    answer: "Cornea",
    acceptableAnswers: [],
    difficulty: "easy",
    subcategory: "biology-human-body"
  },
  {
    slug: "largest-artery",
    question: "What is the name of the largest artery in the human body?",
    answer: "Aorta",
    acceptableAnswers: [],
    difficulty: "medium",
    subcategory: "biology-human-body"
  },
  {
    slug: "medical-name-voice-box",
    question: "What is the medical name for the voice box?",
    answer: "Larynx",
    acceptableAnswers: [],
    difficulty: "easy",
    subcategory: "biology-human-body"
  },
  {
    slug: "medical-name-kneecap",
    question: "What is the medical name for the kneecap?",
    answer: "Patella",
    acceptableAnswers: [],
    difficulty: "medium",
    subcategory: "biology-human-body"
  },
  {
    slug: "metabolism-regulating-gland",
    question: "What gland in the neck regulates metabolism?",
    answer: "Thyroid",
    acceptableAnswers: [],
    difficulty: "easy",
    subcategory: "biology-human-body"
  },
  {
    slug: "oxygen-carrying-protein",
    question: "What protein in red blood cells carries oxygen throughout the body?",
    answer: "Hemoglobin",
    acceptableAnswers: [],
    difficulty: "easy",
    subcategory: "biology-human-body"
  },
  {
    slug: "longest-bone-human-body",
    question: "What is the longest bone in the human body?",
    answer: "Femur",
    acceptableAnswers: [],
    difficulty: "easy",
    subcategory: "biology-human-body"
  },
  {
    slug: "outer-layer-of-skin",
    question: "What is the outermost layer of human skin called?",
    answer: "Epidermis",
    acceptableAnswers: [],
    difficulty: "easy",
    subcategory: "biology-human-body"
  },
  {
    slug: "cell-powerhouse-name",
    question: "What organelle is known as the powerhouse of the cell?",
    answer: "Mitochondria",
    acceptableAnswers: ["Mitochondrion"],
    difficulty: "medium",
    subcategory: "biology-human-body"
  }
];

// ===== medicine-technology (31 questions) =====
const medicine = [
  {
    slug: "mri-full-name",
    question: "What does the medical acronym MRI stand for?",
    answer: "Magnetic Resonance Imaging",
    acceptableAnswers: [],
    difficulty: "medium",
    subcategory: "medicine-technology"
  },
  {
    slug: "abo-blood-types-count",
    question: "How many blood types are there in humans?",
    answer: "Four",
    acceptableAnswers: ["4"],
    difficulty: "hard",
    subcategory: "medicine-technology"
  },
  {
    slug: "facebook-founder-platform",
    question: "What social media platform was founded by Mark Zuckerberg in 2004?",
    answer: "Facebook",
    acceptableAnswers: [],
    difficulty: "easy",
    subcategory: "medicine-technology"
  },
  {
    slug: "ipod-release-year",
    question: "In what year was the first iPod released?",
    answer: "2001",
    acceptableAnswers: [],
    difficulty: "medium",
    subcategory: "medicine-technology"
  },
  {
    slug: "ct-scan-full-name",
    question: "What does CT stand for in CT scan?",
    answer: "Computed Tomography",
    acceptableAnswers: ["Computerized Tomography"],
    difficulty: "hard",
    subcategory: "medicine-technology"
  },
  {
    slug: "gps-full-name",
    question: "What does GPS stand for?",
    answer: "Global Positioning System",
    acceptableAnswers: [],
    difficulty: "easy",
    subcategory: "medicine-technology"
  },
  {
    slug: "world-wide-web-inventor",
    question: "Who invented the World Wide Web?",
    answer: "Tim Berners-Lee",
    acceptableAnswers: ["Berners-Lee"],
    difficulty: "easy",
    subcategory: "medicine-technology"
  },
  {
    slug: "bluetooth-namesake",
    question: "What 10th-century Scandinavian king is Bluetooth technology named after?",
    answer: "Harald Bluetooth",
    acceptableAnswers: ["Harald Gormsson", "Harald Bluetooth Gormsson"],
    difficulty: "hard",
    subcategory: "medicine-technology"
  },
  {
    slug: "defibrillator-function",
    question: "What medical device uses an electric shock to restore a normal heart rhythm?",
    answer: "Defibrillator",
    acceptableAnswers: [],
    difficulty: "medium",
    subcategory: "medicine-technology"
  },
  {
    slug: "smallpox-eradication-year",
    question: "In what year was smallpox declared eradicated by the WHO?",
    answer: "1980",
    acceptableAnswers: [],
    difficulty: "hard",
    subcategory: "medicine-technology"
  },
  {
    slug: "pacemaker-function",
    question: "What medical device is implanted to regulate a patient's heartbeat?",
    answer: "Pacemaker",
    acceptableAnswers: [],
    difficulty: "easy",
    subcategory: "medicine-technology"
  },
  {
    slug: "binary-system-base",
    question: "What is the name for the 2 digit base numbering system comprised of 0s and 1s that computers use?",
    answer: "Binary",
    acceptableAnswers: ["Base 2", "Base-two"],
    difficulty: "easy",
    subcategory: "medicine-technology"
  },
  {
    slug: "html-full-name",
    question: "What does HTML stand for?",
    answer: "HyperText Markup Language",
    acceptableAnswers: [],
    difficulty: "easy",
    subcategory: "medicine-technology"
  },
  {
    slug: "cirrhosis-affected-organ",
    question: "Which organ is affected by the medical condition cirrhosis?",
    answer: "Liver",
    acceptableAnswers: [],
    difficulty: "easy",
    subcategory: "medicine-technology"
  },
  {
    slug: "ekg-full-name",
    question: "What does EKG stand for in medical testing?",
    answer: "Electrocardiogram",
    acceptableAnswers: ["Electrocardiograph"],
    difficulty: "medium",
    subcategory: "medicine-technology"
  },
  {
    slug: "vaccine-origin-word",
    question: "The English word 'vaccine' comes from the Latin word 'vacca,' which is Latin for what animal?",
    answer: "Cow",
    acceptableAnswers: [],
    difficulty: "hard",
    subcategory: "medicine-technology"
  },
  {
    slug: "laser-full-name",
    question: "Fill in the blank: The acronym LASER stands for Light Amplification by Stimulated Emission of _____________ .",
    answer: "Radiation",
    acceptableAnswers: [],
    difficulty: "hard",
    subcategory: "medicine-technology"
  },
  {
    slug: "java-script-original-name",
    question: "What popular programming language was originally called Mocha, but changed to its current name for marketing purposes?",
    answer: "JavaScript",
    acceptableAnswers: [],
    difficulty: "medium",
    subcategory: "medicine-technology"
  },
  {
    slug: "usb-full-name",
    question: "What does the 'U' in 'USB' stand for?",
    answer: "Universal",
    acceptableAnswers: [],
    difficulty: "hard",
    subcategory: "medicine-technology"
  },
  {
    slug: "first-programmer-name",
    question: "Who is considered the first computer programmer for writing an algorithm for the Analytical Engine?",
    answer: "Ada Lovelace",
    acceptableAnswers: ["Ada", "Lovelace"],
    difficulty: "hard",
    subcategory: "medicine-technology"
  },
  {
    slug: "mammogram-screening-test",
    question: "What medical screening test is used to detect breast cancer?",
    answer: "Mammogram",
    acceptableAnswers: ["Mammography"],
    difficulty: "easy",
    subcategory: "medicine-technology"
  }
];

// ===== astronomy-earth-science (22 questions) =====
const astronomy = [
  {
    slug: "earth-satellite-name",
    question: "What is the name of Earth's only natural satellite?",
    answer: "Moon",
    acceptableAnswers: [],
    difficulty: "easy",
    subcategory: "astronomy-earth-science"
  },
  {
    slug: "planet-not-in-zodiac",
    question: "What is the only planet in our solar system that is not included in the zodiac chart?",
    answer: "Earth",
    acceptableAnswers: [],
    difficulty: "easy",
    subcategory: "astronomy-earth-science"
  },
  {
    slug: "planet-not-named-after-greco-roman-god",
    question: "What is the only planet in our solar system that is not named after a Greek or Roman god?",
    answer: "Earth",
    acceptableAnswers: [],
    difficulty: "medium",
    subcategory: "astronomy-earth-science"
  },
  {
    slug: "planet-named-after-greek-god",
    question: "What is the only planet in our solar system that is named after a Greek god (as opposed to all the others, which were named after Roman gods)?",
    answer: "Uranus",
    acceptableAnswers: [],
    difficulty: "medium",
    subcategory: "astronomy-earth-science"
  },
  {
    slug: "planet-shortest-year",
    question: "What planet in our solar system has the shortest year?",
    answer: "Mercury",
    acceptableAnswers: [],
    difficulty: "medium",
    subcategory: "astronomy-earth-science"
  },
  {
    slug: "van-allen-belt-planet",
    question: "Which planet in our solar system is surrounded by the Van Allen belt?",
    answer: "Earth",
    acceptableAnswers: [],
    difficulty: "easy",
    subcategory: "astronomy-earth-science"
  },
  {
    slug: "second-largest-planet",
    question: "What is the second largest planet in our solar system?",
    answer: "Saturn",
    acceptableAnswers: [],
    difficulty: "easy",
    subcategory: "astronomy-earth-science"
  },
  {
    slug: "titan-largest-moon",
    question: "Which planet in our solar system has the largest moon, named 'Titan?'",
    answer: "Saturn",
    acceptableAnswers: [],
    difficulty: "easy",
    subcategory: "astronomy-earth-science"
  },
  {
    slug: "third-brightest-night-sky",
    question: "After the Sun and Moon, what is the third brightest object in the night sky? Hint: It's a planet.",
    answer: "Venus",
    acceptableAnswers: [],
    difficulty: "medium",
    subcategory: "astronomy-earth-science"
  },
  {
    slug: "hottest-planet-solar-system",
    question: "What is the hottest planet in our solar system?",
    answer: "Venus",
    acceptableAnswers: [],
    difficulty: "medium",
    subcategory: "astronomy-earth-science"
  },
  {
    slug: "dwarf-planet-formerly-classified",
    question: "What dwarf planet was once classified as the ninth planet?",
    answer: "Pluto",
    acceptableAnswers: [],
    difficulty: "easy",
    subcategory: "astronomy-earth-science"
  },
  {
    slug: "milky-way-type-of-galaxy",
    question: "Because of its shape, what type of galaxy is the Milky Way considered?",
    answer: "Spiral",
    acceptableAnswers: ["Spiral galaxy", "Barred spiral"],
    difficulty: "hard",
    subcategory: "astronomy-earth-science"
  },
  {
    slug: "earths-rotation-axis-tilt-degrees",
    question: "What is the angle of tilt of Earth's axis in degrees?",
    answer: "23.5",
    acceptableAnswers: ["23.5 degrees", "23.4", "23.4 degrees"],
    difficulty: "medium",
    subcategory: "astronomy-earth-science"
  },
  {
    slug: "solar-eclipse-alignment",
    question: "During a solar eclipse, what celestial body is between the Earth and the Sun?",
    answer: "Moon",
    acceptableAnswers: [],
    difficulty: "easy",
    subcategory: "astronomy-earth-science"
  },
  {
    slug: "earths-moon-distance-miles",
    question: "Approximately how many miles is the Moon from Earth?",
    answer: "238,900",
    acceptableAnswers: ["239,000", "238900"],
    difficulty: "hard",
    subcategory: "astronomy-earth-science"
  },
  {
    slug: "earths-outermost-layer",
    question: "What is the outermost layer of Earth called?",
    answer: "Crust",
    acceptableAnswers: [],
    difficulty: "easy",
    subcategory: "astronomy-earth-science"
  },
  {
    slug: "first-space-shuttle-name",
    question: "What was the name of the first space shuttle to orbit Earth?",
    answer: "Columbia",
    acceptableAnswers: [],
    difficulty: "medium",
    subcategory: "astronomy-earth-science"
  }
];

// ===== chemistry-periodic-table (14 questions) =====
const chemistry = [
  {
    slug: "lightest-element",
    question: "What is the lightest element on the periodic table?",
    answer: "Hydrogen",
    acceptableAnswers: [],
    difficulty: "easy",
    subcategory: "chemistry-periodic-table"
  },
  {
    slug: "element-symbol-fe",
    question: "What element has the chemical symbol Fe?",
    answer: "Iron",
    acceptableAnswers: [],
    difficulty: "easy",
    subcategory: "chemistry-periodic-table"
  },
  {
    slug: "element-symbol-pb",
    question: "What element has the chemical symbol Pb?",
    answer: "Lead",
    acceptableAnswers: [],
    difficulty: "medium",
    subcategory: "chemistry-periodic-table"
  },
  {
    slug: "element-symbol-k",
    question: "What element has the chemical symbol K?",
    answer: "Potassium",
    acceptableAnswers: [],
    difficulty: "medium",
    subcategory: "chemistry-periodic-table"
  },
  {
    slug: "element-symbol-na",
    question: "What element has the chemical symbol Na?",
    answer: "Sodium",
    acceptableAnswers: [],
    difficulty: "medium",
    subcategory: "chemistry-periodic-table"
  },
  {
    slug: "most-abundant-element-universe",
    question: "What is the most abundant element in the universe?",
    answer: "Hydrogen",
    acceptableAnswers: [],
    difficulty: "easy",
    subcategory: "chemistry-periodic-table"
  }

];

// Combine all questions
questions.push(...biology, ...medicine, ...astronomy, ...chemistry);

// Read the existing science.v1.json
const filePath = 'data/live-trivia/categories/science.v1.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// Track existing slugs to avoid duplicates
const existingSlugs = new Set(data.questions.map(q => q.slug));

// Add new questions with full schema
let added = 0;
for (const q of questions) {
  if (existingSlugs.has(q.slug)) {
    console.log(`SKIPPING duplicate slug: ${q.slug}`);
    continue;
  }
  data.questions.push({
    slug: q.slug,
    question: q.question,
    answer: q.answer,
    answer_format: "write_in",
    category: "Science & Tech",
    difficulty: q.difficulty,
    subcategory: q.subcategory
  });
  if (q.acceptableAnswers && q.acceptableAnswers.length > 0) {
    data.questions[data.questions.length - 1].acceptableAnswers = q.acceptableAnswers;
  }
  added++;
}

// Write updated file
fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
console.log(`Added ${added} new questions to ${filePath}`);
console.log(`Total questions: ${data.questions.length}`);
