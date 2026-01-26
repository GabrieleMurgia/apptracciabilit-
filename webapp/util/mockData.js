// webapp/util/mockData.js
sap.ui.define([], function () {
  "use strict";

  // =========================
  // LOG
  // =========================
  var DEBUG = true;
  function _log() {
    if (!DEBUG) return;
    var a = Array.prototype.slice.call(arguments);
    a.unshift("[MockData]");
    console.log.apply(console, a);
  }
  function _err() {
    var a = Array.prototype.slice.call(arguments);
    a.unshift("[MockData][ERROR]");
    console.error.apply(console, a);
  }

  // =========================
  // UTILS
  // =========================
  function padVendor(v) {
    var s = String(v || "").trim();
    if (/^\d+$/.test(s) && s.length < 10) s = s.padStart(10, "0");
    return s;
  }

  function norm(s) { return String(s || "").trim().toUpperCase(); }

  function toDomainsByKey(domainsByName) {
    var out = {};
    Object.keys(domainsByName || {}).forEach(function (d) {
      var m = {};
      (domainsByName[d] || []).forEach(function (it) { 
        m[it.key] = it.text; 
      });
      out[d] = m;
    });
    return out;
  }

  // =========================
  // BUILDER MOCK "HARDCODED" (fallback)
  // =========================
  function buildDomains() {
    return {
      domainsByName: {
        "DOM_COUNTRY": [
          { key: "IT", text: "Italia" },
          { key: "FR", text: "Francia" },
          { key: "ES", text: "Spagna" },
          { key: "DE", text: "Germania" }
        ],
        "DOM_CERT": [
          { key: "GRS", text: "GRS" },
          { key: "RCS", text: "RCS" },
          { key: "LWG", text: "LWG" },
          { key: "FSC", text: "FSC" }
        ],
        "DOM_FIBRA": [
          { key: "COTONE", text: "Cotone" },
          { key: "LANA", text: "Lana" },
          { key: "POLIESTERE", text: "Poliestere" },
          { key: "PELLE", text: "Pelle" }
        ],
        "DOM_STAGIONE": [
          { key: "43", text: "43" },
          { key: "44", text: "44" },
          { key: "45", text: "45" }
        ]
      }
    };
  }

  function buildUserVendors() {
    return [
      { Fornitore: "0000123456", ReagSoc: "CITY MODELES", Open: "X", ToApprove: 2, Rejected: 1 },
      { Fornitore: "0000654321", ReagSoc: "ALPHA SUPPLIES SRL", Open: "X", ToApprove: 1, Rejected: 0 },
      { Fornitore: "0000987654", ReagSoc: "BETA MATERIALS SPA", Open: "", ToApprove: 0, Rejected: 0 }
    ];
  }

  function buildMMCT() {
    var fields = [
      { CatMateriale: "CF", LivelloSchermata: "01", UiFieldname: "Fibra",         Descrizione: "Fibra",             Dominio: "DOM_FIBRA",    MultipleVal: "",  Impostazione: "O" },
      { CatMateriale: "CF", LivelloSchermata: "01", UiFieldname: "FattEmissione", Descrizione: "Fattore Emissione", Dominio: "",             MultipleVal: "",  Impostazione: "O" },
      { CatMateriale: "CF", LivelloSchermata: "01", UiFieldname: "PaeseFibra",    Descrizione: "Paese Fibra",       Dominio: "DOM_COUNTRY",  MultipleVal: "",  Impostazione: ""  },
      { CatMateriale: "CF", LivelloSchermata: "01", UiFieldname: "CertRic",       Descrizione: "Cert. Riciclo",     Dominio: "DOM_CERT",     MultipleVal: "X", Impostazione: ""  },
      { CatMateriale: "CF", LivelloSchermata: "01", UiFieldname: "Stagione",      Descrizione: "Stagione",          Dominio: "DOM_STAGIONE", MultipleVal: "",  Impostazione: ""  },
      { CatMateriale: "CF", LivelloSchermata: "02", UiFieldname: "Linea",         Descrizione: "Linea",             Dominio: "",             MultipleVal: "",  Impostazione: "B" },
      { CatMateriale: "CF", LivelloSchermata: "02", UiFieldname: "QtaFibra",      Descrizione: "Quantità Fibra",    Dominio: "",             MultipleVal: "",  Impostazione: "O" },
      { CatMateriale: "CF", LivelloSchermata: "02", UiFieldname: "NoteMateriale", Descrizione: "Note Materiale",    Dominio: "",             MultipleVal: "",  Impostazione: ""  }
    ];

    return {
      userCategories: [{ CatMateriale: "CF", UserMMCTFields: { results: fields } }],
      userMMCT:       [{ CatMateriale: "CF", UserMMCTFields: { results: fields } }],
      UserInfosMMCT:  [{ CatMateriale: "CF", UserMMCTFields: { results: fields } }]
    };
  }

  function buildMmctFieldsByCat(mmctFields) {
    var out = {};
    (mmctFields || []).forEach(function (f) {
      var c = f && f.CatMateriale;
      if (!c) return;
      if (!out[c]) out[c] = [];
      out[c].push(f);
    });
    return out;
  }

  function buildUserDomainsFromDomainsByName(domainsByName) {
    return Object.keys(domainsByName || {}).map(function (dom) {
      return {
        Domain: dom,
        DomainsValues: { results: (domainsByName[dom] || []).map(function (it) { return { Value: it.key }; }) }
      };
    });
  }

  function applyVm(oVm, cfg) {
    cfg = cfg || {};
    var userId = String(cfg.userId || "E_ZEMAF").trim();
    var userType = String(cfg.userType || "E").trim().toUpperCase();

    var dom = buildDomains();
    var domainsByName = dom.domainsByName;
    var domainsByKey = toDomainsByKey(domainsByName);

    var vendors = buildUserVendors();
    var mmct = buildMMCT();

    var allFields = [];
    (mmct.UserInfosMMCT || []).forEach(function (cat) {
      var rr = (cat.UserMMCTFields && cat.UserMMCTFields.results) || [];
      allFields = allFields.concat(rr);
    });
    var mmctFieldsByCat = buildMmctFieldsByCat(allFields);

    var userDomains = buildUserDomainsFromDomainsByName(domainsByName);

    var payload = {
      userId: userId,
      userType: userType,
      userDescription: "MOCK USER (" + userType + ")",
      showAggregatedTile: userType !== "E",

      auth: {
        role: (userType === "E" ? "FORNITORE" : (userType === "I" ? "VALENTINO" : (userType === "S" ? "SUPERUSER" : "UNKNOWN"))),
        isSupplier: userType === "E",
        isValentino: userType === "I",
        isSuperuser: userType === "S"
      },

      userDomains: userDomains,
      userCategories: mmct.userCategories,
      userVendors: vendors,

      userMMCT: mmct.userMMCT,
      mmctFieldsByCat: mmctFieldsByCat,

      UserInfosMMCT: mmct.UserInfosMMCT,
      UserInfosVend: vendors,
      UserInfosDomains: userDomains,

      domainsByName: domainsByName,
      domainsByKey: domainsByKey,

      mdcCfg: oVm.getProperty("/mdcCfg") || {},
      cache: oVm.getProperty("/cache") || { dataRowsByKey: {}, recordsByKey: {} },

      mock: oVm.getProperty("/mock") || {}
    };

    oVm.setData(payload, true);
    return payload;
  }

  // =========================================================
  // MOCK DA FILE JSON (SOLO NOMI GENERICI)
  // =========================================================
  function _resolveAppUrl(relPath) {
    var p = String(relPath || "").replace(/^\//, "");
    var base = sap.ui.require.toUrl("apptracciabilita/apptracciabilita");
    var url = base.replace(/\/$/, "") + "/" + p;
    _log("_resolveAppUrl", { relPath: relPath, base: base, url: url });
    return url;
  }

  function _unwrapODataPayload(x) {
    if (!x) return x;
    if (x.d) return x.d;       // OData V2 tipico
    if (x.value) return x.value;
    return x;
  }

  function _asResultsArray(x) {
    if (!x) return [];
    if (Array.isArray(x)) return x;
    if (x.results && Array.isArray(x.results)) return x.results;
    return [];
  }

  function _fetchJsonFile(relPath, label) {
    var url = _resolveAppUrl(relPath);
    _log("FETCH ->", url, label ? ("(" + label + ")") : "");
    return fetch(url, { cache: "no-store" }).then(function (resp) {
      _log("FETCH status", { url: url, ok: resp.ok, status: resp.status, statusText: resp.statusText || "" });
      if (!resp.ok) {
        var e = new Error("HTTP " + resp.status + " " + (resp.statusText || "") + " - " + url);
        e.status = resp.status;
        e.url = url;
        throw e;
      }
      return resp.json();
    }).then(function (json) {
      _log("FETCH json ok", { url: url, topKeys: Object.keys(json || {}).slice(0, 30) });
      return json;
    });
  }

  // array results
  function loadODataResultsFromFile(relPath, label) {
    return _fetchJsonFile(relPath, label).then(function (json) {
      var x = _unwrapODataPayload(json);
      var a = _asResultsArray(x);
      _log("loadODataResultsFromFile OK", { label: label || "", relPath: relPath, rows: a.length });
      return a;
    });
  }

  // object (single) payload
  function loadODataObjectFromFile(relPath, label) {
    return _fetchJsonFile(relPath, label).then(function (json) {
      var x = _unwrapODataPayload(json) || {};
      _log("loadODataObjectFromFile OK", { label: label || "", relPath: relPath, keys: Object.keys(x || {}).slice(0, 30) });
      return x;
    });
  }

  // SOLO NOMI GENERICI (come vuoi tu)
  function loadUserInfosSetGeneric() {
    return loadODataObjectFromFile("mock/UserInfosSet.json", "UserInfosSet(GENERIC)");
  }

  function loadMaterialDataSetGeneric() {
    return loadODataResultsFromFile("mock/MaterialDataSet.json", "MaterialDataSet(GENERIC)");
  }

  function loadDataSetGeneric() {
    return loadODataResultsFromFile("mock/DataSet.json", "DataSet(GENERIC)");
  }

  // =========================================================
  // UserInfosSet -> VM (da payload file)
  // =========================================================
  function _buildDomainsByNameFromUserInfosDomains(aDomains) {
    return (aDomains || []).reduce(function (acc, d) {
      if (!d) return acc;
      var sDom = String(d.Domain || d.DOMAIN || d.Dominio || "").trim();
      if (!sDom) return acc;

      var aVals = _asResultsArray(d.DomainsValues || d.DOMAINVALUES || d.Values || d.Valori);
      acc[sDom] = aVals.map(function (x) {
        var v = (x && (x.Value || x.KEY || x.Key || x.value || x.Id)) ?? "";
        v = String(v).trim();
        var t = (x && (
  x.Descrizione ||   
  x.Text ||
  x.DESCR ||
  x.Description ||
  x.Desc ||
  x.text
)) ?? v;
        t = String(t).trim();
        
        return { key: v, text: t };
      }).filter(function (it) { return it.key !== ""; });

      return acc;
    }, {});
  }

  function _extractAllMmctFields(aMMCT) {
    return (aMMCT || []).reduce(function (acc, cat) {
      var aFields = _asResultsArray(cat && (cat.UserMMCTFields || cat.Fields || cat.Campi));
      return acc.concat(aFields);
    }, []);
  }

  function applyVmFromUserInfosPayload(oVm, oData, cfg) {
    cfg = cfg || {};
    oData = _unwrapODataPayload(oData) || {};

    var userId = String(cfg.userId || oData.UserID || oData.UserId || "").trim();
    var userType = String(cfg.userType || oData.UserType || "").trim().toUpperCase();
    var userDescription = String(oData.UserDescription || cfg.userDescription || "").trim();

    var aDomains = _asResultsArray(oData.UserInfosDomains);
    var aMMCT = _asResultsArray(oData.UserInfosMMCT);
    var aVend = _asResultsArray(oData.UserInfosVend);

    var domainsByName = _buildDomainsByNameFromUserInfosDomains(aDomains);
    var domainsByKey = toDomainsByKey(domainsByName);

    var aAllFields = _extractAllMmctFields(aMMCT);
    var mmctFieldsByCat = buildMmctFieldsByCat(aAllFields);

    aMMCT.forEach(function (cat) {
      var c = cat && cat.CatMateriale;
      if (!c) return;
      if (cat.UserMMCTFields && cat.UserMMCTFields.results && mmctFieldsByCat[c]) {
        cat.UserMMCTFields.results = mmctFieldsByCat[c];
      }
    });

    var payload = {
      userId: userId,
      userType: userType,
      userDescription: userDescription,
      showAggregatedTile: userType !== "E",

      auth: {
        role: (userType === "E" ? "FORNITORE" : (userType === "I" ? "VALENTINO" : (userType === "S" ? "SUPERUSER" : "UNKNOWN"))),
        isSupplier: userType === "E",
        isValentino: userType === "I",
        isSuperuser: userType === "S"
      },

      userDomains: aDomains,
      userCategories: aMMCT,
      userVendors: aVend,

      userMMCT: aMMCT,
      mmctFieldsByCat: mmctFieldsByCat,

      UserInfosMMCT: aMMCT,
      UserInfosVend: aVend,
      UserInfosDomains: aDomains,

      domainsByName: domainsByName,
      domainsByKey: domainsByKey,

      mdcCfg: oVm.getProperty("/mdcCfg") || {},
      cache: oVm.getProperty("/cache") || { dataRowsByKey: {}, recordsByKey: {} },

      mock: oVm.getProperty("/mock") || {}
    };

    _log("applyVmFromUserInfosPayload OK", { userId: userId, userType: userType });
    oVm.setData(payload, true);
    return payload;
  }

  function applyVmFromFile(oVm, cfg) {
    cfg = cfg || {};
    var relPath = String(cfg.path || "").trim();
    if (!relPath) return Promise.reject(new Error("applyVmFromFile: cfg.path mancante"));

    // UserInfosSet.json può essere:
    // - direttamente l'oggetto OData (come read /UserInfosSet('...'))
    // - oppure { d: { ... } }
    return loadODataObjectFromFile(relPath, "UserInfosSet(FILE)").then(function (obj) {
      return applyVmFromUserInfosPayload(oVm, obj, cfg);
    });
  }

  return {
    // base
    padVendor: padVendor,

    // fallback hardcoded
    applyVm: applyVm,

    // userinfos
    applyVmFromFile: applyVmFromFile,
    loadUserInfosSetGeneric: loadUserInfosSetGeneric,

    // datasets (generic)
    loadMaterialDataSetGeneric: loadMaterialDataSetGeneric,
    loadDataSetGeneric: loadDataSetGeneric
  };
});
