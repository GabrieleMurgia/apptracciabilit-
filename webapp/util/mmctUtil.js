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
          label: (c.Descrizione || c.DESCRIZIONE || ui),
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

    // stessa tua: order + tie-break stabili
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

  return {
    getSettingFlags: getSettingFlags,
    isMultipleField: isMultipleField,
    isX: isX,
    parseOrder: parseOrder,
    getMmctCfgForCat: getMmctCfgForCat,
    cfgForScreen: cfgForScreen
  };
});
