sap.ui.define([
  "sap/ui/model/json/JSONModel"
], function (JSONModel) {
  "use strict";

  function ensureVmCache(oComponent) {
    var oVm = oComponent.getModel("vm");
    if (!oVm) oVm = new JSONModel({});

    if (!oVm.getProperty("/cache")) oVm.setProperty("/cache", {});
    if (!oVm.getProperty("/cache/dataRowsByKey")) oVm.setProperty("/cache/dataRowsByKey", {});
    if (!oVm.getProperty("/cache/recordsByKey")) oVm.setProperty("/cache/recordsByKey", {});
    if (!oVm.getProperty("/mdcCfg")) oVm.setProperty("/mdcCfg", {});

    oComponent.setModel(oVm, "vm");
    return oVm;
  }

  function getCacheKeySafe(vendorId, material) {
    return encodeURIComponent((vendorId || "") + "||" + (material || ""));
  }

  return { ensureVmCache: ensureVmCache, getCacheKeySafe: getCacheKeySafe };
});
