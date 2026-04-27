sap.ui.define([
  "sap/ui/core/Core"
], function (Core) {
  "use strict";

  function getBundleFromContext(oContext) {
    try {
      if (oContext && typeof oContext.getOwnerComponent === "function") {
        var oComponent = oContext.getOwnerComponent();
        var oModelFromComponent = oComponent && oComponent.getModel && oComponent.getModel("i18n");
        if (oModelFromComponent && oModelFromComponent.getResourceBundle) {
          return oModelFromComponent.getResourceBundle();
        }
      }
    } catch (e1) { console.debug("[i18nUtil] suppressed error", e1); }

    try {
      if (oContext && typeof oContext.getModel === "function") {
        var oModelFromContext = oContext.getModel("i18n");
        if (oModelFromContext && oModelFromContext.getResourceBundle) {
          return oModelFromContext.getResourceBundle();
        }
      }
    } catch (e2) { console.debug("[i18nUtil] suppressed error", e2); }

    try {
      var oCoreModel = Core.getModel("i18n");
      if (oCoreModel && oCoreModel.getResourceBundle) {
        return oCoreModel.getResourceBundle();
      }
    } catch (e3) { console.debug("[i18nUtil] suppressed error", e3); }

    return null;
  }

  return {
    text: function (oContext, sKey, aArgs, sFallback) {
      var oBundle = getBundleFromContext(oContext);
      if (oBundle && oBundle.getText) {
        try {
          return oBundle.getText(sKey, aArgs || []);
        } catch (e) { console.debug("[i18nUtil] suppressed error", e); }
      }
      if (sFallback !== undefined) {
        if (!aArgs || !aArgs.length) return sFallback;
        return String(sFallback).replace(/\{(\d+)\}/g, function (_, iIdx) {
          var v = aArgs[parseInt(iIdx, 10)];
          return v == null ? "" : String(v);
        });
      }
      return sKey;
    }
  };
});
