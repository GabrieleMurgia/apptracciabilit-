sap.ui.define([
  "sap/ui/core/BusyIndicator",
  "sap/ui/model/json/JSONModel"
], function (BusyIndicator, JSONModel) {
  "use strict";

  function buildDomainsByName(aDomains) {
    return (aDomains || []).reduce(function (acc, d) {
      acc[d.Domain] = ((d.DomainsValues && d.DomainsValues.results) || []).map(function (x) {
        return { key: x.Value, text: x.Descrizione };
      });
      return acc;
    }, {});
  }

  function buildDomainsByKey(domainsByName) {
    return Object.keys(domainsByName || {}).reduce(function (acc, dom) {
      var m = {};
      (domainsByName[dom] || []).forEach(function (it) { m[it.key] = it.text; });
      acc[dom] = m;
      return acc;
    }, {});
  }

  function buildMmctFieldsByCat(aMMCT) {
    var aAllFields = (aMMCT || []).reduce(function (acc, cat) {
      return acc.concat((cat.UserMMCTFields && cat.UserMMCTFields.results) || []);
    }, []);

    return aAllFields.reduce(function (acc, f) {
      var c = f && f.CatMateriale;
      if (!c) return acc;
      if (!acc[c]) acc[c] = [];
      acc[c].push(f);
      return acc;
    }, {});
  }

  function buildAuth(sUserType) {
    var t = String(sUserType || "").trim().toUpperCase();
    return {
      role: (t === "E" ? "FORNITORE" : (t === "I" ? "VALENTINO" : (t === "S" ? "SUPERUSER" : "UNKNOWN"))),
      isSupplier: t === "E",
      isValentino: t === "I",
      isSuperuser: t === "S"
    };
  }

  function buildVmData(oVm, oData, sUserId) {
    var sUserType = oData.UserType || "";
    var aDomains = (oData.UserInfosDomains && oData.UserInfosDomains.results) || [];
    var aMMCT = (oData.UserInfosMMCT && oData.UserInfosMMCT.results) || [];
    var domainsByName = buildDomainsByName(aDomains);
    var mmctFieldsByCat = buildMmctFieldsByCat(aMMCT);

    return {
      userId: sUserId,
      userType: sUserType,
      userDescription: oData.UserDescription || "",
      showAggregatedTile: sUserType !== "E",
      auth: buildAuth(sUserType),
      userDomains: aDomains,
      userCategories: aMMCT,
      userMMCT: aMMCT,
      mmctFieldsByCat: mmctFieldsByCat,
      UserInfosMMCT: aMMCT,
      UserInfosDomains: aDomains,
      domainsByName: domainsByName,
      domainsByKey: buildDomainsByKey(domainsByName),
      mdcCfg: oVm.getProperty("/mdcCfg") || {},
      cache: oVm.getProperty("/cache") || { dataRowsByKey: {}, recordsByKey: {} }
    };
  }

  return {
    buildVmData: buildVmData,

    ensureUserInfosLoaded: function (opts) {
      if (opts.isLoadedFn()) {
        return Promise.resolve();
      }

      var oComponent = opts.component;
      var oVm = oComponent.getModel("vm");
      var oModel = oComponent.getModel();
      var fnLog = opts.logFn || function () {};

      if (!oVm) {
        oVm = new JSONModel({
          userId: "", userType: "",
          cache: { dataRowsByKey: {}, recordsByKey: {} },
          mdcCfg: {}, domainsByName: {}, domainsByKey: {},
          mmctFieldsByCat: {}
        });
        oComponent.setModel(oVm, "vm");
      }

      if (!oModel || typeof oModel.read !== "function") {
        fnLog("_ensureUserInfosLoaded: no OData model, redirecting to Screen0");
        oComponent.getRouter().navTo("Screen0", {}, true);
        return new Promise(function () {});
      }

      fnLog("_ensureUserInfosLoaded: reloading UserInfos from backend...");
      BusyIndicator.show(0);

      return new Promise(function (resolve, reject) {
        oModel.metadataLoaded().then(function () {
          var sUserId = oVm.getProperty("/userId") || "";
          var sPath = "/UserInfosSet('" + sUserId + "')";

          oModel.read(sPath, {
            urlParameters: {
              "$expand": "UserInfosDomains/DomainsValues,UserInfosMMCT/UserMMCTFields",
              "sap-language": "IT"
            },
            success: function (oData) {
              BusyIndicator.hide();
              if (!oData) {
                fnLog("_ensureUserInfosLoaded: no data returned, redirecting to Screen0");
                oComponent.getRouter().navTo("Screen0", {}, true);
                reject();
                return;
              }

              var oVmData = buildVmData(oVm, oData, sUserId);
              oVm.setData(oVmData, true);

              fnLog("_ensureUserInfosLoaded: OK", {
                userId: sUserId,
                userType: oData.UserType || ""
              });
              resolve();
            },
            error: function (oError) {
              BusyIndicator.hide();
              console.error("[BaseUserInfoUtil] _ensureUserInfosLoaded ERROR", oError);
              oComponent.getRouter().navTo("Screen0", {}, true);
              reject(oError);
            }
          });
        }).catch(function (err) {
          BusyIndicator.hide();
          console.error("[BaseUserInfoUtil] _ensureUserInfosLoaded metadata ERROR", err);
          oComponent.getRouter().navTo("Screen0", {}, true);
          reject(err);
        });
      });
    }
  };
});
