// ============================================================
// Prayer Time Notifier - background.js (Service Worker)
// ============================================================

const PRAYER_NAMES = {
  Fajr:    "الفجر",
  Dhuhr:   "الظهر",
  Asr:     "العصر",
  Maghrib: "المغرب",
  Isha:    "العشاء"
};

const API_BASE = "https://api.aladhan.com/v1";

// ─── Utility: Get today's date in DD-MM-YYYY ─────────────────
function getTodayDate() {
  const now = new Date();
  const dd  = String(now.getDate()).padStart(2, "0");
  const mm  = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

// ─── Fetch prayer times from AlAdhan API ─────────────────────
async function fetchPrayerTimes(city, country = "SA") {
  const date = getTodayDate();
  const url  = `${API_BASE}/timingsByCity/${date}?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&method=4`;

  console.log(`[PrayerNotifier] Fetching prayer times for ${city} | URL: ${url}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const json = await response.json();
  if (json.code !== 200) {
    throw new Error(`API returned code ${json.code}: ${json.status}`);
  }

  const timings = json.data.timings;
  console.log("[PrayerNotifier] Timings received:", timings);
  return timings;
}

// ─── Parse "HH:MM" into today's Date object ──────────────────
function parseTimeToday(timeStr) {
  // Strip timezone suffix like " (UTC+3)" if present
  const clean = timeStr.split(" ")[0];
  const [hours, minutes] = clean.split(":").map(Number);
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d;
}

// ─── Schedule chrome alarms for each prayer ──────────────────
async function schedulePrayerAlarms(timings) {
  console.log("[PrayerNotifier] Clearing old alarms...");
  await chrome.alarms.clearAll();

  const now = Date.now();

  for (const [prayer, arabicName] of Object.entries(PRAYER_NAMES)) {
    const timeStr = timings[prayer];
    if (!timeStr) {
      console.warn(`[PrayerNotifier] No timing found for ${prayer}`);
      continue;
    }

    const prayerDate = parseTimeToday(timeStr);
    const prayerMs   = prayerDate.getTime();

    if (prayerMs <= now) {
      console.log(`[PrayerNotifier] ${prayer} already passed (${timeStr}), skipping.`);
      continue;
    }

    const alarmName = `prayer_${prayer}`;
    await chrome.alarms.create(alarmName, { when: prayerMs });
    console.log(`[PrayerNotifier] Alarm set → ${prayer} (${arabicName}) at ${timeStr}`);
  }

  // Daily update alarm — fires every 24 hours
  await chrome.alarms.create("dailyUpdate", { delayInMinutes: 1440, periodInMinutes: 1440 });
  console.log("[PrayerNotifier] Daily update alarm scheduled (every 24h).");
}

// ─── Show notification ────────────────────────────────────────
function showPrayerNotification(prayerKey) {
  const arabicName = PRAYER_NAMES[prayerKey];
  if (!arabicName) return;

  console.log(`[PrayerNotifier] Showing notification for ${prayerKey} (${arabicName})`);

  chrome.notifications.create(`notif_${prayerKey}_${Date.now()}`, {
    type:     "basic",
    iconUrl:  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    title:    `🕌 وقت صلاة ${arabicName}`,
    message:  `حان الآن موعد صلاة ${arabicName}`,
    priority: 2
  });
}

// ─── Load city from storage and refresh prayer times ─────────
async function refreshPrayerTimes() {
  const data = await chrome.storage.sync.get(["city", "country"]);
  const city    = data.city    || null;
  const country = data.country || "SA";

  if (!city) {
    console.log("[PrayerNotifier] No city saved yet. Waiting for user input.");
    return;
  }

  console.log(`[PrayerNotifier] Refreshing times for city: ${city}, country: ${country}`);

  try {
    const timings = await fetchPrayerTimes(city, country);
    await schedulePrayerAlarms(timings);
    await chrome.storage.sync.set({ lastUpdated: new Date().toISOString(), timings });
    console.log("[PrayerNotifier] Prayer times saved and alarms scheduled successfully.");
  } catch (err) {
    console.error("[PrayerNotifier] Failed to fetch/schedule prayer times:", err);
  }
}

// ─── Alarm listener ───────────────────────────────────────────
chrome.alarms.onAlarm.addListener((alarm) => {
  console.log(`[PrayerNotifier] Alarm fired: ${alarm.name}`);

  if (alarm.name === "dailyUpdate") {
    console.log("[PrayerNotifier] Daily update triggered.");
    refreshPrayerTimes();
    return;
  }

  if (alarm.name.startsWith("prayer_")) {
    const prayerKey = alarm.name.replace("prayer_", "");
    showPrayerNotification(prayerKey);
  }
});

// ─── Message listener (from popup.js) ────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[PrayerNotifier] Message received:", message);

  if (message.action === "citySelected") {
    const { city, country } = message;
    chrome.storage.sync.set({ city, country }, async () => {
      console.log(`[PrayerNotifier] City saved: ${city}, Country: ${country}`);
      await refreshPrayerTimes();
      sendResponse({ success: true });
    });
    return true; // keep channel open for async sendResponse
  }

  if (message.action === "refreshNow") {
    refreshPrayerTimes().then(() => sendResponse({ success: true }));
    return true;
  }
});

// ─── On install / startup ─────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  console.log("[PrayerNotifier] Extension installed. Attempting initial load...");
  refreshPrayerTimes();
});

chrome.runtime.onStartup.addListener(() => {
  console.log("[PrayerNotifier] Browser started. Refreshing prayer times...");
  refreshPrayerTimes();
});