/**
 * domains.js — Domain value lookup helpers.
 */
sap.ui.define([], function () {
  "use strict";

  /**
   * Check if a domain has values loaded in the VM model.
   */
  function domainHasValues(oComponent, sDomain) {
    if (!sDomain) {
      return false;
    }
    var oVm = oComponent.getModel("vm");
    var a = (oVm && oVm.getProperty("/domainsByName/" + sDomain)) || [];
    return Array.isArray(a) && a.length > 0;
  }

  return {
    domainHasValues: domainHasValues
  };
});
