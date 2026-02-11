/**
 * vmCache.js — VM model cache initialization and cache key helpers.
 *
 */
sap.ui.define([
  "sap/ui/model/json/JSONModel",
  "apptracciabilita/apptracciabilita/util/normalize"
], function (JSONModel, N) {
  "use strict";

  /**
   * Ensure the VM model has the cache structure initialized.
   * Returns the VM model reference.
   */
  function ensureVmCache(oComponent) {
    var oVm = oComponent.getModel("vm");
    if (!oVm) {
      oVm = new JSONModel({});
      oComponent.setModel(oVm, "vm");
    }

    if (!oVm.getProperty("/cache")) {
      oVm.setProperty("/cache", {
        dataRowsByKey: {},
        recordsByKey: {}
      });
    }
    if (!oVm.getProperty("/cache/dataRowsByKey")) {
      oVm.setProperty("/cache/dataRowsByKey", {});
    }
    if (!oVm.getProperty("/cache/recordsByKey")) {
      oVm.setProperty("/cache/recordsByKey", {});
    }

    return oVm;
  }

  /**
   * Build a safe cache key from vendor + material.
   */
  function getCacheKeySafe(sVendorId, sMaterial) {
    return N.buildCacheKeySafe(sVendorId, sMaterial);
  }

  return {
    ensureVmCache: ensureVmCache,
    getCacheKeySafe: getCacheKeySafe
  };
});
