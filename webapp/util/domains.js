sap.ui.define([], function () {
  "use strict";

  function domainHasValues(oComponent, sDomain) {
    if (!sDomain) return false;
    var oVm = oComponent.getModel("vm");
    var a = (oVm && oVm.getProperty("/domainsByName/" + sDomain)) || [];
    return Array.isArray(a) && a.length > 0;
  }

  return { domainHasValues: domainHasValues };
});
