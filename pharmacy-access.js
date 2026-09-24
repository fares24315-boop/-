/* مزامنة بيانات الصيدلية بين كل الأجهزة عبر قاعدة البيانات */
(function () {
  var API_URL = "/api/public/state";
  var saveTimer = null;
  var pendingState = null;
  var inFlight = null;

  function setStatus(text, ok) {
    var el = document.getElementById("syncStatus");
    if (!el) return;
    el.textContent = text;
    el.style.color = ok ? "#16a34a" : "#ef4444";
  }

  function ensureBadge() {
    if (document.getElementById("syncStatus")) return;
    var el = document.createElement("div");
    el.id = "syncStatus";
    el.style.cssText =
      "position:fixed;bottom:10px;left:10px;z-index:9999;font-size:12px;" +
      "background:rgba(255,255,255,.92);border:1px solid rgba(15,23,42,.12);" +
      "border-radius:999px;padding:5px 12px;box-shadow:0 6px 18px rgba(15,23,42,.12);" +
      "pointer-events:none;max-width:60vw;";
    el.textContent = "جارٍ الاتصال بقاعدة البيانات…";
    document.body.appendChild(el);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureBadge);
  } else {
    ensureBadge();
  }

  function flush() {
    if (inFlight || !pendingState) return Promise.resolve();
    var body = pendingState;
    pendingState = null;
    inFlight = fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (res) {
        if (!res.ok) throw new Error("save failed");
        setStatus("تم الحفظ على قاعدة البيانات", true);
      })
      .catch(function () {
        setStatus("تعذر الحفظ — سيتم إعادة المحاولة", false);
        pendingState = pendingState || body;
      })
      .then(function () {
        inFlight = null;
        if (pendingState) flush();
      });
    return inFlight;
  }

  /* سجل حركات المخزون: يقارن الأصناف قبل وبعد كل حفظ */
  var FIELDS = ["name", "type", "qty", "price", "cost", "expiry", "barcode", "supplier", "notes"];
  var snapshot = null;
  function takeSnapshot(products) {
    var map = {};
    (Array.isArray(products) ? products : []).forEach(function (p) {
      if (p && p.id != null) map[p.id] = JSON.parse(JSON.stringify(p));
    });
    return map;
  }
  function recordInventoryChanges(state) {
    if (!state || typeof state !== "object") return;
    var current = takeSnapshot(state.products);
    if (snapshot === null) {
      try {
        var raw = localStorage.getItem("pharmacy_inventory_snapshot");
        snapshot = raw ? JSON.parse(raw) : current;
      } catch (e) { snapshot = current; }
    }
    var user = window.__pharmacyUser || sessionStorage.getItem("pharmacy_admin_name") || "غير معروف";
    var now = new Date().toISOString();
    var log = Array.isArray(state.inventoryLog) ? state.inventoryLog : [];
    Object.keys(current).forEach(function (id) {
      var after = current[id], before = snapshot[id];
      if (!before) {
        log.push({ id: Date.now() + Math.random(), action: "add", productId: after.id, productName: after.name, username: user, date: now,
          changes: FIELDS.filter(function (f) { return after[f] != null && after[f] !== ""; }).map(function (f) { return { field: f, before: null, after: after[f] }; }) });
        return;
      }
      var changes = FIELDS.filter(function (f) { return String(before[f] ?? "") !== String(after[f] ?? ""); })
        .map(function (f) { return { field: f, before: before[f], after: after[f] }; });
      if (changes.length) log.push({ id: Date.now() + Math.random(), action: "edit", productId: after.id, productName: after.name, username: user, date: now, changes: changes });
    });
    Object.keys(snapshot).forEach(function (id) {
      if (!current[id]) {
        var b = snapshot[id];
        log.push({ id: Date.now() + Math.random(), action: "delete", productId: b.id, productName: b.name, username: user, date: now,
          changes: FIELDS.filter(function (f) { return b[f] != null && b[f] !== ""; }).map(function (f) { return { field: f, before: b[f], after: null }; }) });
      }
    });
    if (log.length > 3000) log = log.slice(-3000);
    state.inventoryLog = log;
    snapshot = current;
    try { localStorage.setItem("pharmacy_inventory_snapshot", JSON.stringify(snapshot)); } catch (e) {}
  }

  window.pharmacyAccess = {
    getApiUrl: function () {
      return API_URL;
    },
    load: function () {
      return fetch(API_URL, { headers: { Accept: "application/json" } })
        .then(function (res) {
          if (!res.ok) throw new Error("load failed");
          return res.json();
        })
        .then(function (body) {
          setStatus("متصل بقاعدة البيانات", true);
          var data = body && body.data ? body.data : {};
          if (Array.isArray(data.products)) {
            snapshot = takeSnapshot(data.products);
            try { localStorage.setItem("pharmacy_inventory_snapshot", JSON.stringify(snapshot)); } catch (e) {}
          }
          return data;
        })
        .catch(function (err) {
          setStatus("غير متصل — البيانات محلية فقط", false);
          throw err;
        });
    },
    save: function (state) {
      try { recordInventoryChanges(state); } catch (e) {}
      pendingState = state;
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(flush, 300);
      return Promise.resolve();
    },
  };

  window.addEventListener("beforeunload", function () {
    if (pendingState && navigator.sendBeacon) {
      navigator.sendBeacon(
        API_URL,
        new Blob([JSON.stringify(pendingState)], { type: "application/json" }),
      );
    }
  });
})();
