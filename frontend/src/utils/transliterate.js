/**
 * English → Tamil Dictionary-based Translation
 *
 * This module provides two functions:
 * 1. translateWord(word)   — Dictionary lookup for known domain words
 * 2. transliterateToTamil(text) — Phonetic fallback for unknown words
 *
 * Domain dictionary covers rice warehouse terminology:
 * warehouses, rice types, transactions, quality grades, locations etc.
 */

// ── Domain Dictionary ──────────────────────────────────────────────────────
// Key: lowercase English word → Tamil translation
const DICTIONARY = {
  // Rice types
  "rice":          "அரிசி",
  "ponni":         "பொன்னி",
  "basmati":       "பாஸ்மதி",
  "sona":          "சோனா",
  "masoori":       "மசூரி",
  "raw":           "பச்சை",
  "boiled":        "புழுங்கல்",
  "parboiled":     "புழுங்கல்",
  "broken":        "உடைந்த",
  "premium":       "உயர் தரம்",
  "standard":      "நிலையான",
  "grade":         "தரம்",

  // Warehouse / logistics
  "warehouse":     "கிடங்கு",
  "warehouses":    "கிடங்குகள்",
  "stock":         "இருப்பு",
  "stocks":        "இருப்புகள்",
  "inbound":       "வரவு",
  "outbound":      "செலவு",
  "arrival":       "வரவு",
  "dispatch":      "அனுப்பு",
  "loading":       "ஏற்றுதல்",
  "unloading":     "இறக்குதல்",
  "transport":     "போக்குவரத்து",
  "vehicle":       "வாகனம்",
  "truck":         "லாரி",
  "lorry":         "லாரி",
  "bags":          "மூட்டைகள்",
  "bag":           "மூட்டை",
  "quantity":      "அளவு",
  "weight":        "எடை",
  "capacity":      "திறன்",
  "total":         "மொத்தம்",
  "remaining":     "மீதமுள்ளது",

  // People / roles
  "admin":         "நிர்வாகி",
  "user":          "பயனர்",
  "users":         "பயனர்கள்",
  "driver":        "ஓட்டுநர்",
  "buyer":         "வாங்குபவர்",
  "seller":        "விற்பவர்",
  "supplier":      "சப்ளையர்",
  "farmer":        "விவசாயி",

  // Actions
  "add":           "சேர்",
  "edit":          "திருத்து",
  "delete":        "நீக்கு",
  "save":          "சேமி",
  "cancel":        "ரத்து",
  "search":        "தேடு",
  "filter":        "வடிகட்டு",
  "export":        "ஏற்றுமதி",
  "import":        "இறக்குமதி",
  "report":        "அறிக்கை",
  "reports":       "அறிக்கைகள்",
  "dashboard":     "கண்ணோட்டம்",
  "login":         "உள்நுழை",
  "logout":        "வெளியேறு",
  "settings":      "அமைப்புகள்",

  // Time
  "today":         "இன்று",
  "yesterday":     "நேற்று",
  "week":          "வாரம்",
  "month":         "மாதம்",
  "year":          "ஆண்டு",
  "date":          "தேதி",

  // Status
  "active":        "செயலில்",
  "inactive":      "செயலற்றது",
  "pending":       "நிலுவையில்",
  "completed":     "முடிந்தது",
  "cancelled":     "ரத்தானது",

  // Common
  "name":          "பெயர்",
  "address":       "முகவரி",
  "phone":         "தொலைபேசி",
  "email":         "மின்னஞ்சல்",
  "notes":         "குறிப்புகள்",
  "company":       "நிறுவனம்",
  "brand":         "பிராண்ட்",
  "source":        "மூலம்",
  "destination":   "இலக்கு",
  "location":      "இடம்",
  "yes":           "ஆம்",
  "no":            "இல்லை",
  "ok":            "சரி",

  // Numbers (common domain values)
  "kg":            "கிலோ",
  "ton":           "டன்",
  "tonne":         "டன்",
  "tonnes":        "டன்",

  // Tamil Nadu city names (common warehouse locations)
  "chennai":       "சென்னை",
  "coimbatore":    "கோயம்புத்தூர்",
  "madurai":       "மதுரை",
  "trichy":        "திருச்சி",
  "salem":         "சேலம்",
  "tirunelveli":   "திருநெல்வேலி",
  "erode":         "ஈரோடு",
  "thanjavur":     "தஞ்சாவூர்",
  "vellore":       "வேலூர்",
  "tiruppur":      "திருப்பூர்",
  "karur":         "கரூர்",
  "dindigul":      "திண்டுக்கல்",
  "nagapattinam":  "நாகப்பட்டினம்",
  "cuddalore":     "கடலூர்",
  "kumbakonam":    "கும்பகோணம்",
};

/**
 * Translate a single word using the dictionary.
 * Returns null if not found (caller should fallback to transliterate).
 */
export function translateWord(word) {
  if (!word) return null;
  return DICTIONARY[word.toLowerCase()] || null;
}

/**
 * Translate a phrase word-by-word using the dictionary.
 * Unknown words are passed through unchanged (not transliterated —
 * proper nouns like brand names should stay in English).
 */
export function translatePhrase(text) {
  if (!text) return "";
  return text
    .split(/(\s+)/)
    .map(token => {
      if (/^\s+$/.test(token)) return token; // preserve whitespace
      const translated = translateWord(token.replace(/[^a-zA-Z]/g, ""));
      return translated || token; // keep original if unknown
    })
    .join("");
}

// ── Phonetic Transliteration (fallback) ───────────────────────────────────
// Used when a user types a name that isn't in the dictionary.
const PHONETIC_RULES = [
  // Longer patterns first (greedy match)
  ["zha", "ழ"], ["zhi", "ழி"], ["zh", "ழ"],
  ["nga", "ங"], ["nj", "ஞ"],
  ["cha", "ச"], ["chi", "சி"], ["chu", "சு"], ["che", "செ"], ["cho", "சோ"], ["chaa", "சா"],
  ["sha", "ச"], ["shi", "சி"],
  ["tha", "த"], ["thi", "தி"],
  ["kaa", "கா"], ["kii", "கீ"], ["kuu", "கூ"],
  ["paa", "பா"], ["pii", "பீ"],
  ["maa", "மா"], ["mii", "மீ"],
  ["raa", "ரா"],
  ["laa", "லா"],
  ["naa", "நா"],
  ["taa", "தா"],
  ["aa", "ஆ"], ["ii", "ஈ"], ["uu", "ஊ"], ["ee", "ஏ"], ["oo", "ஓ"],
  ["ai", "ஐ"], ["au", "ஔ"],
  ["ka", "க"], ["ki", "கி"], ["ku", "கு"], ["ke", "கெ"], ["ko", "கோ"],
  ["ga", "க"], ["gi", "கி"], ["gu", "கு"],
  ["sa", "ச"], ["si", "சி"], ["su", "சு"], ["se", "செ"], ["so", "சோ"],
  ["ta", "த"], ["ti", "தி"], ["tu", "து"], ["te", "தெ"], ["to", "தோ"],
  ["da", "த"], ["di", "தி"], ["du", "து"],
  ["na", "ந"], ["ni", "நி"], ["nu", "நு"], ["ne", "நெ"], ["no", "நோ"],
  ["pa", "ப"], ["pi", "பி"], ["pu", "பு"], ["pe", "பெ"], ["po", "போ"],
  ["ba", "ப"], ["bi", "பி"], ["bu", "பு"],
  ["fa", "ப"], ["fi", "பி"],
  ["ma", "ம"], ["mi", "மி"], ["mu", "மு"], ["me", "மெ"], ["mo", "மோ"],
  ["ya", "ய"], ["yi", "யி"], ["yu", "யு"], ["ye", "யெ"], ["yo", "யோ"],
  ["ra", "ர"], ["ri", "ரி"], ["ru", "ரு"], ["re", "ரெ"], ["ro", "ரோ"],
  ["la", "ல"], ["li", "லி"], ["lu", "லு"], ["le", "லெ"], ["lo", "லோ"],
  ["va", "வ"], ["vi", "வி"], ["vu", "வு"], ["ve", "வெ"], ["vo", "வோ"],
  ["wa", "வ"], ["wi", "வி"],
  ["La", "ள"], ["Li", "ளி"], ["Lu", "ளு"],
  ["Na", "ண"], ["Ni", "ணி"], ["Nu", "ணு"],
  ["a", "அ"], ["i", "இ"], ["u", "உ"], ["e", "எ"], ["o", "ஒ"],
  // Bare consonants
  ["k", "க்"], ["g", "க்"],
  ["ch", "ச்"], ["s", "ச்"],
  ["t", "த்"], ["d", "த்"],
  ["n", "ன்"],
  ["p", "ப்"], ["b", "ப்"], ["f", "ப்"],
  ["m", "ம்"],
  ["y", "ய்"],
  ["r", "ர்"],
  ["l", "ல்"],
  ["v", "வ்"], ["w", "வ்"],
  ["z", "ழ்"],
];

export function transliterateToTamil(text) {
  if (!text) return "";

  // First try dictionary translation
  const dictResult = translatePhrase(text);
  // If at least one word was translated, use that
  if (dictResult !== text) return dictResult;

  // Phonetic fallback for unknown brand/place names
  let result = "";
  let i = 0;
  const lower = text.toLowerCase();

  while (i < lower.length) {
    if (lower[i] === " " || lower[i] === "-" || lower[i] === ".") {
      result += lower[i]; i++; continue;
    }
    let matched = false;
    for (const [pattern, tamil] of PHONETIC_RULES) {
      if (lower.startsWith(pattern, i)) {
        result += tamil;
        i += pattern.length;
        matched = true;
        break;
      }
    }
    if (!matched) { result += text[i]; i++; }
  }
  return result;
}

/**
 * Auto-suggest Tamil translation for a field value.
 * Returns translated string or empty string if no suggestion.
 */
export function autoTranslate(text) {
  if (!text || text.length < 2) return "";
  const translated = translatePhrase(text);
  return translated !== text ? translated : transliterateToTamil(text);
}
