// i18n — data-i18n dictionaries (EN/AR), RTL switch, choice persisted in
// localStorage. Usage: <span data-i18n="key">English default</span>.
(() => {
  const DICTS = {
    en: {
      "step2.hint": "Plug the USB cable into the upper driver-side USB-A port, then press Connect and pick the device. If a prompt appears on the car screen, allow it.",
      "connectBtn": "Connect the head unit",
      "connect.btn.connecting": "Connecting…",
      "device.model": "Model",
      "device.android": "Android",
      "device.firmware": "Firmware",
      "device.serial": "Serial",
      "device.app": "App",
      "device.dmInstalled": "Installed:",
      "device.dmNotInstalled": "DisplayMirror not installed",
      "connect.waitingPick": "Waiting for device selection…",
      "connect.connecting": "Connecting to",
      "connect.auth": "Authenticating — approve the prompt on the car screen if it appears…",
      "connect.ok": "Connected",
      "connect.failed": "Connect failed",
      "connect.noInterface": "Selected device has no ADB interface",
      "connect.disconnected": "USB device disconnected",
      "step3.hint": "Downloads the latest release from GitHub, installs it, grants all permissions and enables auto-start — one click.",
      "install.btn": "Install / Update",
      "install.useFile": "Use a local APK",
      "install.optAccessibility": "Also enable the nav-bar back button (accessibility service)",
      "install.latest": "Latest release",
      "install.latestUnavailable": "Latest release unavailable — use a local APK",
      "install.usingFile": "Using local APK",
      "install.downloading": "Downloading",
      "install.start": "Install started",
      "install.ok": "OK",
      "install.failed": "FAILED",
      "install.skipped": "skipped",
      "install.done": "Setup complete — DisplayMirror is installed and running.",
      "install.aborted": "Install aborted — fix the failing step and press Install again.",
      "install.notConnected": "Not connected",
      "install.noAsset": "No APK asset in latest release",
      "install.step.download": "Download APK",
      "install.step.push": "Copy to the car",
      "install.step.install": "Install APK",
      "install.step.cluster": "Rebind instrument cluster",
      "install.step.appops": "Special permissions (overlay, projection)",
      "install.step.runtime": "Storage & location permissions",
      "install.step.carperms": "Vehicle data permissions",
      "install.step.notif": "Notification listener & settings access",
      "install.step.accessibility": "Nav-bar back button service",
      "install.step.autostart": "Auto-start on boot",
      "install.step.keys": "ADB keys (force-stop & split-screen)",
      "install.step.launch": "Launch DisplayMirror",
    },
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
      "phase2": "تثبيت بنقرة واحدة مع الأذونات والإعداد التلقائي — في التحديث القادم.",
      "phase4": "اختيار إصدار البرنامج ورمز القفل المباشر والدليل خطوة بخطوة — في التحديث القادم.",
      "phase5": "فحص التحديثات ومفاتيح التعطيل وإلغاء التثبيت والتشخيص — لاحقاً.",
      "step2.hint": "وصّل كابل USB بالمنفذ العلوي جهة السائق (USB-A)، ثم اضغط «توصيل» واختر الجهاز. إذا ظهرت رسالة على شاشة السيارة، اسمح بالاتصال.",
      "connectBtn": "توصيل شاشة السيارة",
      "connect.btn.connecting": "جارٍ الاتصال…",
      "device.model": "الطراز",
      "device.android": "أندرويد",
      "device.firmware": "إصدار البرنامج",
      "device.serial": "الرقم التسلسلي",
      "device.app": "التطبيق",
      "device.dmInstalled": "مثبّت:",
      "device.dmNotInstalled": "DisplayMirror غير مثبّت",
      "connect.waitingPick": "بانتظار اختيار الجهاز…",
      "connect.connecting": "جارٍ الاتصال بـ",
      "connect.auth": "جارٍ المصادقة — اسمح بالاتصال إذا ظهرت رسالة على شاشة السيارة…",
      "connect.ok": "تم الاتصال:",
      "connect.failed": "فشل الاتصال:",
      "connect.noInterface": "الجهاز المختار لا يحتوي على واجهة ADB",
      "connect.disconnected": "تم فصل جهاز USB",
      "step3.hint": "يُنزّل أحدث إصدار من GitHub ويثبّته ويمنح كل الأذونات ويفعّل التشغيل التلقائي — بنقرة واحدة.",
      "install.btn": "تثبيت / تحديث",
      "install.useFile": "استخدام ملف APK محلي",
      "install.optAccessibility": "تفعيل زر الرجوع في شريط التنقل أيضاً (خدمة إمكانية الوصول)",
      "install.latest": "أحدث إصدار",
      "install.latestUnavailable": "تعذّر جلب أحدث إصدار — استخدم ملف APK محلي",
      "install.usingFile": "استخدام ملف APK محلي:",
      "install.downloading": "جارٍ التنزيل",
      "install.start": "بدأ التثبيت",
      "install.ok": "نجح",
      "install.failed": "فشل",
      "install.skipped": "تم التخطي",
      "install.done": "اكتمل الإعداد — تم تثبيت DisplayMirror وهو يعمل الآن.",
      "install.aborted": "توقف التثبيت — عالج الخطوة الفاشلة ثم اضغط «تثبيت» مرة أخرى.",
      "install.notConnected": "غير متصل",
      "install.noAsset": "لا يوجد ملف APK في أحدث إصدار",
      "install.step.download": "تنزيل ملف APK",
      "install.step.push": "النسخ إلى السيارة",
      "install.step.install": "تثبيت التطبيق",
      "install.step.cluster": "إعادة ربط عدادات القياس",
      "install.step.appops": "الأذونات الخاصة (العرض فوق التطبيقات، البث)",
      "install.step.runtime": "أذونات التخزين والموقع",
      "install.step.carperms": "أذونات بيانات المركبة",
      "install.step.notif": "مستمع الإشعارات والوصول للإعدادات",
      "install.step.accessibility": "خدمة زر الرجوع",
      "install.step.autostart": "التشغيل التلقائي عند الإقلاع",
      "install.step.keys": "مفاتيح ADB (إيقاف التطبيقات والشاشة المنقسمة)",
      "install.step.launch": "تشغيل DisplayMirror",
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
