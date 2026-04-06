import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en.json";
import ta from "./locales/ta.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ta: { translation: ta },
    },
    fallbackLng: "en",
    supportedLngs: ["en", "ta"],
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "i18nextLng",
    },
    interpolation: { escapeValue: false },
    // When language changes, update <html lang> and font class
    postProcess: [],
  });

// Sync html lang attribute and Tamil font class on language change
i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng;
  document.title = lng === "ta"
    ? "அரிசி கிடங்கு மேலாண்மை"
    : "Rice Warehouse Manager";

  // Apply Tamil font class to body for proper Unicode rendering
  if (lng === "ta") {
    document.body.classList.add("lang-ta");
    // Load Noto Sans Tamil if not already loaded
    if (!document.getElementById("noto-tamil-font")) {
      const link = document.createElement("link");
      link.id = "noto-tamil-font";
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Noto+Sans+Tamil:wght@400;500;600;700&display=swap";
      document.head.appendChild(link);
    }
  } else {
    document.body.classList.remove("lang-ta");
  }
});

// Run once on load
i18n.on("initialized", () => {
  const lng = i18n.language;
  document.documentElement.lang = lng;
  if (lng === "ta") {
    document.body.classList.add("lang-ta");
    if (!document.getElementById("noto-tamil-font")) {
      const link = document.createElement("link");
      link.id = "noto-tamil-font";
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Noto+Sans+Tamil:wght@400;500;600;700&display=swap";
      document.head.appendChild(link);
    }
  }
});

export default i18n;
