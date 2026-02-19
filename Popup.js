// ============================================================
// Prayer Time Notifier - popup.js
// ============================================================

const PRAYER_LABELS = {
  Fajr:    "الفجر",
  Sunrise: "الشروق",
  Dhuhr:   "الظهر",
  Asr:     "العصر",
  Maghrib: "المغرب",
  Isha:    "العشاء"
};

const citySelect      = document.getElementById("citySelect");
const saveBtn         = document.getElementById("saveBtn");
const statusEl        = document.getElementById("status");
const timingsSection  = document.getElementById("timings-section");
const timingsList     = document.getElementById("timings-list");
const currentCityLbl  = document.getElementById("current-city-label");
const refreshBtn      = document.getElementById("refreshBtn");

// ─── Show status message ──────────────────────────────────────
function setStatus(msg, type = "info") {
  statusEl.textContent = msg;
  statusEl.className = type;
}

// ─── Enable/disable save button based on selection ───────────
citySelect.addEventListener("change", () => {
  saveBtn.disabled = !citySelect.value;
});

// ─── Render timings table ─────────────────────────────────────
function renderTimings(timings, cityName) {
  timingsList.innerHTML = "";

  const prayersToShow = ["Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha"];

  prayersToShow.forEach((key) => {
    const raw = timings[key];
    if (!raw) return;

    // Strip timezone label like " (UTC+3)" if present
    const cleanTime = raw.split(" ")[0];

    const row = document.createElement("div");
    row.className = "prayer-row";
    row.innerHTML = `
      <span class="prayer-name">${PRAYER_LABELS[key] || key}</span>
      <span class="prayer-time">${cleanTime}</span>
    `;
    timingsList.appendChild(row);
  });

  if (cityName) {
    currentCityLbl.textContent = `📍 ${cityName}`;
  }

  timingsSection.classList.add("visible");
  console.log("[Popup] Timings rendered successfully.");
}

// ─── Load saved data on popup open ───────────────────────────
function loadSavedData() {
  console.log("[Popup] Loading saved data from storage...");

  chrome.storage.sync.get(["city", "country", "cityLabel", "timings"], (data) => {
    console.log("[Popup] Storage data:", data);

    if (data.city) {
      // Restore dropdown selection
      const matchValue = `${data.city}|${data.country || "SA"}`;
      for (const opt of citySelect.options) {
        if (opt.value === matchValue) {
          opt.selected = true;
          break;
        }
      }
      saveBtn.disabled = false;
    }

    if (data.timings) {
      renderTimings(data.timings, data.cityLabel || data.city);
    }
  });
}

// ─── Save city and send message to background ─────────────────
saveBtn.addEventListener("click", () => {
  const selected = citySelect.value;
  if (!selected) return;

  const [city, country] = selected.split("|");
  const cityLabel = citySelect.options[citySelect.selectedIndex].text;

  console.log(`[Popup] City selected: ${city} | Country: ${country} | Label: ${cityLabel}`);

  saveBtn.disabled = true;
  setStatus("⏳ جاري جلب أوقات الصلاة...", "info");

  // Save label separately for display
  chrome.storage.sync.set({ cityLabel }, () => {
    chrome.runtime.sendMessage(
      { action: "citySelected", city, country },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("[Popup] Message error:", chrome.runtime.lastError.message);
          setStatus("❌ حدث خطأ في التواصل مع الخدمة.", "error");
          saveBtn.disabled = false;
          return;
        }

        if (response && response.success) {
          setStatus("✅ تم تفعيل التنبيهات بنجاح!", "success");
          console.log("[Popup] City saved and alarms scheduled.");

          // Wait briefly then reload timings from storage
          setTimeout(() => {
            chrome.storage.sync.get(["timings"], (data) => {
              if (data.timings) {
                renderTimings(data.timings, cityLabel);
              }
            });
          }, 2000);
        } else {
          setStatus("⚠️ لم يتم الاستجابة بشكل صحيح.", "error");
        }

        saveBtn.disabled = false;
      }
    );
  });
});

// ─── Manual refresh button ────────────────────────────────────
refreshBtn.addEventListener("click", () => {
  console.log("[Popup] Manual refresh requested.");
  refreshBtn.disabled = true;
  refreshBtn.textContent = "⏳ جاري التحديث...";

  chrome.runtime.sendMessage({ action: "refreshNow" }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("[Popup] Refresh error:", chrome.runtime.lastError.message);
    }

    setTimeout(() => {
      chrome.storage.sync.get(["timings", "cityLabel", "city"], (data) => {
        if (data.timings) {
          renderTimings(data.timings, data.cityLabel || data.city);
          console.log("[Popup] Timings refreshed and re-rendered.");
        }
        refreshBtn.disabled = false;
        refreshBtn.textContent = "🔄 تحديث الأوقات";
      });
    }, 2500);
  });
});

// ─── Init ─────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  console.log("[Popup] DOM loaded. Initializing...");
  loadSavedData();
});