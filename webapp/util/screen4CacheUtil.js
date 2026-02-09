sap.ui.define([
  "apptracciabilita/apptracciabilita/util/vmCache"
], function (VmCache) {
  "use strict";

  var Screen4CacheUtil = {

    setSelectedParentForScreen4: function (oParentOrNull, oVm, oComponent) {
      oVm.setProperty("/selectedScreen3Record", oParentOrNull || null);
      oComponent.setModel(oVm, "vm");
    },

    getSelectedParentForScreen4: function (oVm) {
      return oVm ? oVm.getProperty("/selectedScreen3Record") : null;
    },

    ensureScreen4CacheForParentIdx: function (iIdx, sGuid, oVm, sCacheKeySafe) {
      var mAll = oVm.getProperty("/cache/screen4DetailsByKey") || {};
      if (!mAll[sCacheKeySafe]) mAll[sCacheKeySafe] = {};
      if (!mAll[sCacheKeySafe][String(iIdx)]) mAll[sCacheKeySafe][String(iIdx)] = [];
      oVm.setProperty("/cache/screen4DetailsByKey", mAll);

      var mP = oVm.getProperty("/cache/screen4ParentGuidByIdx") || {};
      if (!mP[sCacheKeySafe]) mP[sCacheKeySafe] = {};
      mP[sCacheKeySafe][String(iIdx)] = sGuid || "";
      oVm.setProperty("/cache/screen4ParentGuidByIdx", mP);
    },

    purgeScreen4CacheByParentIdx: function (aIdx, oVm, sCacheKeySafe) {
      var mAll = oVm.getProperty("/cache/screen4DetailsByKey") || {};
      if (mAll[sCacheKeySafe]) {
        (aIdx || []).forEach(function (n) { delete mAll[sCacheKeySafe][String(n)]; });
        oVm.setProperty("/cache/screen4DetailsByKey", mAll);
      }
      var mP = oVm.getProperty("/cache/screen4ParentGuidByIdx") || {};
      if (mP[sCacheKeySafe]) {
        (aIdx || []).forEach(function (n) { delete mP[sCacheKeySafe][String(n)]; });
        oVm.setProperty("/cache/screen4ParentGuidByIdx", mP);
      }
    }
  };

  return Screen4CacheUtil;
});