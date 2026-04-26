sap.ui.define([
  "apptracciabilita/apptracciabilita/util/vmModelPaths",
  "apptracciabilita/apptracciabilita/util/screenFlowStateUtil"
], function (VmPaths, ScreenFlowStateUtil) {
  "use strict";

  var Screen4CacheUtil = {

    setSelectedParentForScreen4: function (oParentOrNull, oVm, oComponent) {
      ScreenFlowStateUtil.setSelectedParentForScreen4(oVm, oParentOrNull || null);
      oComponent.setModel(oVm, "vm");
    },

    getSelectedParentForScreen4: function (oVm) {
      return ScreenFlowStateUtil.getSelectedParentForScreen4(oVm);
    },

    ensureScreen4CacheForParentIdx: function (iIdx, sGuid, oVm, sCacheKeySafe) {
      var mAll = oVm.getProperty(VmPaths.SCREEN4_DETAILS_BY_KEY) || {};
      if (!mAll[sCacheKeySafe]) mAll[sCacheKeySafe] = {};
      if (!mAll[sCacheKeySafe][String(iIdx)]) mAll[sCacheKeySafe][String(iIdx)] = [];
      oVm.setProperty(VmPaths.SCREEN4_DETAILS_BY_KEY, mAll);

      var mP = oVm.getProperty(VmPaths.SCREEN4_PARENT_GUID_BY_IDX) || {};
      if (!mP[sCacheKeySafe]) mP[sCacheKeySafe] = {};
      mP[sCacheKeySafe][String(iIdx)] = sGuid || "";
      oVm.setProperty(VmPaths.SCREEN4_PARENT_GUID_BY_IDX, mP);
    },

    purgeScreen4CacheByParentIdx: function (aIdx, oVm, sCacheKeySafe) {
      var mAll = oVm.getProperty(VmPaths.SCREEN4_DETAILS_BY_KEY) || {};
      if (mAll[sCacheKeySafe]) {
        (aIdx || []).forEach(function (n) { delete mAll[sCacheKeySafe][String(n)]; });
        oVm.setProperty(VmPaths.SCREEN4_DETAILS_BY_KEY, mAll);
      }
      var mP = oVm.getProperty(VmPaths.SCREEN4_PARENT_GUID_BY_IDX) || {};
      if (mP[sCacheKeySafe]) {
        (aIdx || []).forEach(function (n) { delete mP[sCacheKeySafe][String(n)]; });
        oVm.setProperty(VmPaths.SCREEN4_PARENT_GUID_BY_IDX, mP);
      }
    }
  };

  return Screen4CacheUtil;
});
