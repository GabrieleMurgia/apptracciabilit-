sap.ui.define([
  "apptracciabilita/apptracciabilita/util/vmModelPaths"
], function (VmPaths) {
  "use strict";

  function getVm(oVm) {
    return oVm || null;
  }

  function read(oVm, sPath, vDefault) {
    var oModel = getVm(oVm);
    if (!oModel) return vDefault;
    var v = oModel.getProperty(sPath);
    return v === undefined ? vDefault : v;
  }

  function write(oVm, sPath, vValue) {
    var oModel = getVm(oVm);
    if (!oModel) return;
    oModel.setProperty(sPath, vValue);
  }

  return {
    setSelectedParentForScreen4: function (oVm, oParentOrNull) {
      write(oVm, VmPaths.SELECTED_SCREEN3_RECORD, oParentOrNull || null);
    },

    getSelectedParentForScreen4: function (oVm) {
      return read(oVm, VmPaths.SELECTED_SCREEN3_RECORD, null);
    },

    clearSelectedParentForScreen4: function (oVm) {
      write(oVm, VmPaths.SELECTED_SCREEN3_RECORD, null);
    },

    setNoMatListContext: function (oVm, bEnabled, sCatMateriale) {
      write(oVm, VmPaths.NO_MAT_LIST_MODE, !!bEnabled);
      write(oVm, VmPaths.NO_MAT_LIST_CAT, bEnabled ? String(sCatMateriale || "") : "");
    },

    getNoMatListContext: function (oVm) {
      return {
        enabled: !!read(oVm, VmPaths.NO_MAT_LIST_MODE, false),
        catMateriale: String(read(oVm, VmPaths.NO_MAT_LIST_CAT, "") || "")
      };
    },

    setCurrentSeason: function (oVm, sSeason) {
      write(oVm, VmPaths.CURRENT_SEASON, String(sSeason || ""));
    },

    getCurrentSeason: function (oVm) {
      return String(read(oVm, VmPaths.CURRENT_SEASON, "") || "");
    },

    markReturnFromScreen4: function (oVm) {
      write(oVm, VmPaths.SKIP_S3_BACKEND_ONCE, true);
    },

    shouldSkipScreen3BackendOnce: function (oVm) {
      return !!read(oVm, VmPaths.SKIP_S3_BACKEND_ONCE, false);
    },

    consumeSkipScreen3BackendOnce: function (oVm) {
      var bVal = !!read(oVm, VmPaths.SKIP_S3_BACKEND_ONCE, false);
      write(oVm, VmPaths.SKIP_S3_BACKEND_ONCE, false);
      return bVal;
    },

    markForceScreen3CacheReload: function (oVm) {
      write(oVm, VmPaths.FORCE_S3_CACHE_RELOAD, true);
    },

    shouldForceScreen3CacheReload: function (oVm) {
      return !!read(oVm, VmPaths.FORCE_S3_CACHE_RELOAD, false);
    },

    consumeForceScreen3CacheReload: function (oVm) {
      var bVal = !!read(oVm, VmPaths.FORCE_S3_CACHE_RELOAD, false);
      write(oVm, VmPaths.FORCE_S3_CACHE_RELOAD, false);
      return bVal;
    },

    setSelectedCatMateriale: function (oVm, sCatMateriale) {
      write(oVm, VmPaths.SELECTED_CAT_MATERIALE, String(sCatMateriale || ""));
    },

    getSelectedCatMateriale: function (oVm) {
      return String(read(oVm, VmPaths.SELECTED_CAT_MATERIALE, "") || "");
    },

    clearSelectedCatMateriale: function (oVm) {
      write(oVm, VmPaths.SELECTED_CAT_MATERIALE, "");
    },

    markVendorCacheStale: function (oVm) {
      write(oVm, VmPaths.VENDOR_CACHE_STALE, true);
    },

    consumeVendorCacheStale: function (oVm) {
      var bVal = !!read(oVm, VmPaths.VENDOR_CACHE_STALE, false);
      write(oVm, VmPaths.VENDOR_CACHE_STALE, false);
      return bVal;
    }
  };
});
