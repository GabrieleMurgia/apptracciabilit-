sap.ui.define([], function () {
  "use strict";

  function getSettingFlags(c) {
    var s = String((c && (c.Impostazione !== undefined ? c.Impostazione : c.IMPOSTAZIONE)) || "")
      .trim().toUpperCase();
    return { required: s === "O", locked: s === "B", hidden: s === "N" };
  }

  function isMultipleField(c) {
    var s = String((c && (c.MultipleVal !== undefined ? c.MultipleVal : c.MULTIPLEVAL)) || "")
      .trim().toUpperCase();
    return s === "X";
  }

  function isX(v) {
    return String(v || "").trim().toUpperCase() === "X";
  }

  function parseOrder(c) {
    var n = parseInt(String((c && (c.Ordinamento ?? c.ORDINAMENTO ?? "")) || "").trim(), 10);
    return isNaN(n) ? 9999 : n;
  }

  function _normUiKey(kRaw) {
    var k = String(kRaw || "").trim();
    if (!k) return "";
    return (k.toUpperCase() === "STATO") ? "Stato" : k;
  }

  function getMmctCfgForCat(oVm, sCat) {
    var aUserInfos = (oVm && (oVm.getProperty("/UserInfosMMCT") || oVm.getProperty("/userInfosMMCT"))) || [];
    if (!Array.isArray(aUserInfos)) return [];
    var oCat = aUserInfos.find(function (x) { return String(x && x.CatMateriale) === String(sCat); });
    var aFields = (oCat && oCat.UserMMCTFields && oCat.UserMMCTFields.results) ? oCat.UserMMCTFields.results : [];
    return Array.isArray(aFields) ? aFields : [];
  }

  function cfgForScreen(oVm, sCat, sScreen) {
    var a = getMmctCfgForCat(oVm, sCat) || [];
    var sTarget = String(sScreen || "");
    if (sTarget.length === 1) sTarget = "0" + sTarget;

    var out = (a || [])
      .filter(function (c) {
        var lv = String(c.LivelloSchermata || "");
        if (lv.length === 1) lv = "0" + lv;
        return lv === sTarget;
      })
      .map(function (c) {
        var ui = String(c.UiFieldname || c.UIFIELDNAME || "").trim();
        var label = String(c.UiFieldLabel || c.UIFIELDLABEL || "").trim();
        if (!label) label = (c.Descrizione || c.DESCRIZIONE || ui);
        if (!ui) return null;

        var flags = getSettingFlags(c);
        if (flags.hidden) return null;

        var domain = String(
          c.Dominio !== undefined ? c.Dominio :
          (c.DOMINIO !== undefined ? c.DOMINIO :
            (c.Domain !== undefined ? c.Domain : (c.DOMAIN !== undefined ? c.DOMAIN : "")))
        ).trim();

        return {
          ui: ui,
          label: label,
          domain: domain,
          required: !!flags.required,
          locked: !!flags.locked,
          multiple: isMultipleField(c),
          order: parseOrder(c),
          testata1: isX(c.Testata1 ?? c.TESTATA1),
          testata2: isX(c.Testata2 ?? c.TESTATA2)
        };
      })
      .filter(Boolean);

    out.sort(function (a, b) {
      var ao = (a && a.order != null) ? a.order : 9999;
      var bo = (b && b.order != null) ? b.order : 9999;
      if (ao !== bo) return ao - bo;

      var al = String((a && a.label) || "");
      var bl = String((b && b.label) || "");
      var cmp = al.localeCompare(bl, undefined, { sensitivity: "base" });
      if (cmp !== 0) return cmp;

      var au = String((a && a.ui) || "");
      var bu = String((b && b.ui) || "");
      return au.localeCompare(bu, undefined, { sensitivity: "base" });
    });

    return out;
  }

  // =========================
  // NEW: hydrate MMCT runtime
  // =========================
  function pickRaw0FromRows(aRows, getCodAggFn) {
    if (!Array.isArray(aRows) || !aRows.length) return {};
    var fn = (typeof getCodAggFn === "function") ? getCodAggFn : function (r) {
      return String(r && (r.CodAgg != null ? r.CodAgg : r.CODAGG) || "").trim().toUpperCase();
    };
    var r0 = aRows.find(function (r) { return fn(r) !== "N"; }) || aRows[0] || {};
    return r0 || {};
  }

  function hydrateMmctFromRows(oVm, aRows, getCodAggFn) {
    var r0 = pickRaw0FromRows(aRows, getCodAggFn);
    var sCat = String(r0.CatMateriale || "").trim();

    var a00All = sCat ? cfgForScreen(oVm, sCat, "00") : [];
    var aHdr3 = (a00All || [])
      .filter(function (f) { return !!(f && f.testata1); })
      .filter(function (f) { return String(f.ui || "").trim().toUpperCase() !== "FORNITORE"; });

    var a01All = sCat ? cfgForScreen(oVm, sCat, "01") : [];
    var a01Table = (a01All || []).filter(function (f) { return !(f && f.testata1); });

    var a02All = sCat ? cfgForScreen(oVm, sCat, "02") : [];

    return {
      cat: sCat,
      raw0: r0,
      s00: a00All,
      hdr3: aHdr3,
      s01: a01All,
      s01Table: a01Table,
      s02: a02All
    };
  }

  // =========================
  // NEW: header fields
  // =========================
  function buildHeaderFields(mmct, valToTextFn) {
    mmct = mmct || {};
    var aHdr = mmct.hdr3 || [];
    var r0 = mmct.raw0 || {};

    var a = (aHdr || [])
      .slice()
      .sort(function (a, b) { return (a.order ?? 9999) - (b.order ?? 9999); })
      .map(function (f) {
        var kRaw = String((f && f.ui) || "").trim();
        var k = _normUiKey(kRaw);
        var v = r0 ? r0[k] : "";
        var txt = (typeof valToTextFn === "function") ? valToTextFn(v) : String(v == null ? "" : v);
        return { key: k, label: f.label || kRaw || k, value: txt };
      });

    return a;
  }

  // =========================
  // NEW: required map (S01/S02)
  // =========================
  function getRequiredMap(mmct) {
    mmct = mmct || {};
    var a01 = mmct.s01 || [];
    var a02 = mmct.s02 || [];

    var req01 = {};
    var req02 = {};

    (a01 || []).forEach(function (f) {
      if (f && f.ui && f.required) req01[_normUiKey(f.ui)] = f;
    });
    (a02 || []).forEach(function (f) {
      if (f && f.ui && f.required) req02[_normUiKey(f.ui)] = f;
    });

    return { req01: req01, req02: req02 };
  }

  // =========================
  // NEW: multi fields + normalizzazione separatori
  // =========================
  function getMultiFieldsMap(mmct) {
    mmct = mmct || {};
    var a01 = mmct.s01 || [];
    var a02 = mmct.s02 || [];

    var m = {};
    [a01, a02].forEach(function (arr) {
      (arr || []).forEach(function (f) {
        if (!f || !f.ui || !f.multiple) return;
        m[_normUiKey(f.ui)] = true;
      });
    });

    return m;
  }

  function normalizeMultiString(v, sSepOut) {
    var sep = (sSepOut == null ? ";" : String(sSepOut));

    if (v == null) return v;

    if (Array.isArray(v)) {
      return v
        .map(function (x) { return String(x || "").trim(); })
        .filter(Boolean)
        .join(sep);
    }

    var s = String(v || "").trim();
    if (!s) return "";

    // se non contiene separatori "noti", lascio com’è
    if (s.indexOf(";") < 0 && s.indexOf("|") < 0) return s;

    return s
      .split(/[;|]+/)
      .map(function (x) { return String(x || "").trim(); })
      .filter(Boolean)
      .join(sep);
  }

  function formatIncomingRowsMultiSeparators(aRows, mmctOrMap, sSepOut) {
    if (!Array.isArray(aRows) || !aRows.length) return;

    var mMulti = null;

    // se mi passi mmct (ha s01/s02) lo calcolo, altrimenti assumo sia già map
    if (mmctOrMap && (mmctOrMap.s01 || mmctOrMap.s02)) mMulti = getMultiFieldsMap(mmctOrMap);
    else mMulti = mmctOrMap || {};

    var aKeys = Object.keys(mMulti || {});
    if (!aKeys.length) return;

    var sep = (sSepOut == null ? ";" : String(sSepOut));

    aRows.forEach(function (r) {
      if (!r) return;
      aKeys.forEach(function (k) {
        var v = r[k];
        if (typeof v === "string" && v.indexOf("|") >= 0) {
          r[k] = normalizeMultiString(v, sep);
        }
      });
    });
  }

  return {
    getSettingFlags: getSettingFlags,
    isMultipleField: isMultipleField,
    isX: isX,
    parseOrder: parseOrder,
    getMmctCfgForCat: getMmctCfgForCat,
    cfgForScreen: cfgForScreen,

    // NEW exports
    pickRaw0FromRows: pickRaw0FromRows,
    hydrateMmctFromRows: hydrateMmctFromRows,
    buildHeaderFields: buildHeaderFields,
    getRequiredMap: getRequiredMap,
    getMultiFieldsMap: getMultiFieldsMap,
    normalizeMultiString: normalizeMultiString,
    formatIncomingRowsMultiSeparators: formatIncomingRowsMultiSeparators
  };
});
