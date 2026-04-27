sap.ui.define([], function () {
  "use strict";

  function getBindingPath(oControl) {
    var oBinding = (oControl && (
      oControl.getBinding("value") ||
      oControl.getBinding("selectedKey") ||
      oControl.getBinding("selectedKeys")
    )) || null;
    return (oBinding && oBinding.getPath && oBinding.getPath()) || "";
  }

  function findInputByBindingPath(aControls, sModelName, sPath, sExcludedIdPart, aAllowedContextPrefixes) {
    var aMatches = (aControls || []).filter(function (oControl) {
      if (!oControl || !oControl.getVisible || !oControl.getVisible()) return false;
      if (sExcludedIdPart && String(oControl.getId() || "").indexOf(sExcludedIdPart) >= 0) return false;
      if (!oControl.getBindingContext || !oControl.getBindingContext(sModelName)) return false;
      return getBindingPath(oControl) === sPath;
    });

    if (!aAllowedContextPrefixes || !aAllowedContextPrefixes.length) {
      return aMatches[0] || null;
    }

    return aMatches.find(function (oControl) {
      var oCtx = oControl.getBindingContext(sModelName);
      var sCtxPath = (oCtx && oCtx.getPath && oCtx.getPath()) || "";
      return aAllowedContextPrefixes.some(function (sPrefix) {
        return String(sCtxPath).indexOf(sPrefix) === 0;
      });
    }) || aMatches[0] || null;
  }

  function setInputValue(oInput, sValue) {
    oInput.setValue(sValue);
    if (typeof oInput.fireLiveChange === "function") {
      oInput.fireLiveChange({ value: sValue });
    }
    if (typeof oInput.fireChange === "function") {
      oInput.fireChange({ value: sValue });
    }
  }

  function writeBoundFieldValue(oControl, sModelName, sFieldPath, sValue) {
    var oCtx = oControl && oControl.getBindingContext && oControl.getBindingContext(sModelName);
    var oModel = oCtx && oCtx.getModel && oCtx.getModel();
    var sCtxPath = oCtx && oCtx.getPath && oCtx.getPath();
    if (!oModel || !oModel.setProperty || !sCtxPath) return;
    oModel.setProperty(sCtxPath + "/" + sFieldPath, sValue);
  }

  function findButtonByIcon(aControls, sIcon) {
    return (aControls || []).find(function (oControl) {
      return oControl &&
        typeof oControl.getIcon === "function" &&
        oControl.getIcon() === sIcon &&
        (!oControl.getVisible || oControl.getVisible());
    }) || null;
  }

  function getBackendSnapshot() {
    if (window.__vendTraceIntegrationBackend && typeof window.__vendTraceIntegrationBackend.getStateSnapshot === "function") {
      return window.__vendTraceIntegrationBackend.getStateSnapshot();
    }
    return {};
  }

  function decodeBase64ToUint8Array(sBase64) {
    var sBinary = window.atob(String(sBase64 || ""));
    var aBytes = new Uint8Array(sBinary.length);
    var i;
    for (i = 0; i < sBinary.length; i++) {
      aBytes[i] = sBinary.charCodeAt(i);
    }
    return aBytes;
  }

  return {
    findInputByBindingPath: findInputByBindingPath,
    setInputValue: setInputValue,
    writeBoundFieldValue: writeBoundFieldValue,
    findButtonByIcon: findButtonByIcon,
    getBackendSnapshot: getBackendSnapshot,
    decodeBase64ToUint8Array: decodeBase64ToUint8Array
  };
});
