// i18n — data-i18n dictionaries (EN/AR), RTL switch, choice persisted in
// localStorage. Usage: <span data-i18n="key">English default</span>.
(() => {
  const DICTS = {
    en: {},
    ar: {
      "tagline": "ثبّت DisplayMirror على جيتور G700 — مباشرةً من كروم. بلا حاسوب، بلا أوامر.",
      "check.engine": "محرّك ADB",
      "check.secure": "صفحة آمنة (HTTPS)",
      "check.usb": "WebUSB",
      "check.browser": "المتصفح",
      "step1.title": "١ · تفعيل ADB في السيارة (مرة واحدة)",
      "step2.title": "٢ · توصيل شاشة السيارة",
      "step3.title": "٣ · تثبيت DisplayMirror",
      "tools.title": "أدوات",
      "log.title": "سجل النشاط",
      "log.copy": "نسخ",
      "log.clear": "مسح",
      "footer.credits": "DisplayMirror مفتوح المصدر. مصدر إلهام خطوات التثبيت: unlokit.net. كل شيء على هذه الصفحة يعمل داخل متصفحك — لا يتم رفع أي شيء.",
      "footer.safety": "أوقف السيارة تماماً قبل التثبيت. لا تستخدم الموقع أثناء القيادة.",
      "phase1": "زر التوصيل ولوحة الجهاز — في التحديث القادم.",
      "phase2": "تثبيت بنقرة واحدة مع الأذونات والإعداد التلقائي — في التحديث القادم.",
      "phase4": "اختيار إصدار البرنامج ورمز القفل المباشر والدليل خطوة بخطوة — في التحديث القادم.",
      "phase5": "فحص التحديثات ومفاتيح التعطيل وإلغاء التثبيت والتشخيص — لاحقاً.",
      "gate.nonchrome": "يعمل هذا الموقع في متصفح كروم فقط (على حاسوب أو هاتف). افتح الصفحة في كروم ثم أعد المحاولة.",
      "gate.insecure": "يجب فتح الصفحة عبر HTTPS (أو localhost) حتى يعمل WebUSB.",
      "gate.nousb": "متصفحك لا يدعم WebUSB. استخدم كروم على الحاسوب أو على هاتف أندرويد.",
      "gate.brave": "في متصفح Brave قد يحجب Shields خاصية WebUSB — خفّض الحماية لهذا الموقع أو استخدم كروم.",
    },
  };

  // English copy lives directly in the HTML; EN dict stays empty on purpose.
  const LANGS = { en: { dir: "ltr", rtl: false }, ar: { dir: "rtl", rtl: true } };
  let lang = localStorage.getItem("dm-lang") || "en";
  if (!LANGS[lang]) lang = "en";

  function t(key) {
    return DICTS[lang][key] ?? DICTS.en[key] ?? key;
  }

  function apply() {
    const meta = LANGS[lang];
    document.documentElement.lang = lang;
    document.documentElement.dir = meta.dir;
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.dataset.i18n;
      // Keep the original English text as fallback for missing keys.
      if (!(key in el.dataset)) el.dataset.en = el.innerHTML;
      el.innerHTML = lang === "en" ? el.dataset.en : (DICTS[lang][key] ?? el.dataset.en);
    });
    document.getElementById("langEn")?.setAttribute("aria-pressed", String(lang === "en"));
    document.getElementById("langAr")?.setAttribute("aria-pressed", String(lang === "ar"));
  }

  function setLang(next) {
    lang = next;
    localStorage.setItem("dm-lang", lang);
    apply();
  }

  window.DMI18n = { t, setLang, get lang() { return lang; } };

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("langEn")?.addEventListener("click", () => setLang("en"));
    document.getElementById("langAr")?.addEventListener("click", () => setLang("ar"));
    apply();
  });
})();
