/**
 * BaseController.js — Base controller for all screens.
 *
 * Centralizes:
 * - Logging (_log, _logTable)
 * - VM / Detail model access (_getOVm, _getODetail)
 * - Cache key helpers (_getCacheKeySafe, _getExportCacheKey)
 * - Navigation (onNavBack, _performNavBack)
 * - Mock detection (_isMockEnabled)
 */
sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/routing/History",
  "sap/ui/core/BusyIndicator",
  "apptracciabilita/apptracciabilita/util/normalize",
  "apptracciabilita/apptracciabilita/util/vmCache"
], function (Controller, History, BusyIndicator, N, VmCache) {
  "use strict";

  return Controller.extend("apptracciabilita.apptracciabilita.controller.BaseController", {

    /**
     * Screen prefix for log output. Override in subclass.
     * @example "[S3]", "[S4]", "[S2]"
     */
    _sLogPrefix: "[BASE]",

    // ==================== LOGGING ====================

    _log: function () {
      var a = Array.prototype.slice.call(arguments);
      a.unshift(this._sLogPrefix + " " + N.ts());
      console.log.apply(console, a);
    },

    _dbg: function () {
      if (this._DBG === false) return;
      var a = Array.prototype.slice.call(arguments);
      a.unshift(this._sLogPrefix + "DBG " + N.ts());
      console.log.apply(console, a);
    },

    _logTable: function (label, sTableId) {
      var oTbl = this.byId(sTableId || this.PARENT_TABLE_ID || "mdcTable3");
      if (!oTbl) return this._log(label, "NO TABLE");
      var aCols = (oTbl.getColumns && oTbl.getColumns()) || [];
      this._log(label, {
        id: oTbl.getId(),
        colsCount: aCols.length,
        visibleCols: aCols.filter(function (c) { return c.getVisible && c.getVisible(); }).length,
        delegate: oTbl.getDelegate && oTbl.getDelegate()
      });
    },

    // ==================== MODEL ACCESS ====================

    _getOVm: function () {
      return VmCache.ensureVmCache(this.getOwnerComponent());
    },

    _getODetail: function () {
      return this.getView().getModel("detail");
    },

    // ==================== CACHE KEYS ====================

    _getCacheKeySafe: function () {
      return VmCache.getCacheKeySafe(this._sVendorId, this._sMaterial);
    },

    _getExportCacheKey: function (sMockFlag) {
      var oVm = this.getOwnerComponent().getModel("vm");
      var mock = (oVm && oVm.getProperty("/mock")) || {};
      var sFlag = sMockFlag || this._sMockFlag || "mockS3";
      return (mock[sFlag] ? "MOCK|" : "REAL|") + this._getCacheKeySafe();
    },

    // ==================== MOCK DETECTION ====================

    _isMockEnabled: function (sFlag) {
      var oVm = this.getOwnerComponent().getModel("vm");
      var mock = (oVm && oVm.getProperty("/mock")) || {};
      return !!(mock[sFlag || this._sMockFlag || "mockS3"]);
    },

    // ==================== USER INFOS GUARD ====================

    /**
     * Check if UserInfos data has been loaded into the "vm" model.
     * Returns true if essential data (userId, userType, mmctFieldsByCat) is present.
     */
    _isUserInfosLoaded: function () {
      var oVm = this.getOwnerComponent().getModel("vm");
      if (!oVm) return false;
      var sUserId = oVm.getProperty("/userId");
      var sUserType = oVm.getProperty("/userType");
      var mMmct = oVm.getProperty("/mmctFieldsByCat");
      return !!(sUserId && sUserType && mMmct && Object.keys(mMmct).length > 0);
    },

    /**
     * Ensure UserInfos are loaded. If not (e.g. browser refresh), reload them.
     * Returns a Promise that resolves when data is ready.
     *
     * Usage in _onRouteMatched:
     *   this._ensureUserInfosLoaded().then(function() { ... proceed ... });
     */
    _ensureUserInfosLoaded: function () {
      if (this._isUserInfosLoaded()) {
        return Promise.resolve();
      }

      var oComponent = this.getOwnerComponent();
      var oVm = oComponent.getModel("vm");
      var oModel = oComponent.getModel(); // OData model

      // If vm doesn't exist yet, create a minimal one
      if (!oVm) {
        var JSONModel = sap.ui.require("sap/ui/model/json/JSONModel");
        oVm = new JSONModel({
          userId: "", userType: "", mock: {},
          cache: { dataRowsByKey: {}, recordsByKey: {} },
          mdcCfg: {}, domainsByName: {}, domainsByKey: {},
          mmctFieldsByCat: {}
        });
        oComponent.setModel(oVm, "vm");
      }

      // Check for mock mode
      var mock = oVm.getProperty("/mock") || {};
      if (mock.mockS0) {
        // Mock mode: delegate to Screen0 by redirecting
        this._log("_ensureUserInfosLoaded: mock mode, redirecting to Screen0");
        oComponent.getRouter().navTo("Screen0", {}, true);
        return new Promise(function () {}); // never resolves — user will be redirected
      }

      if (!oModel || typeof oModel.read !== "function") {
        this._log("_ensureUserInfosLoaded: no OData model, redirecting to Screen0");
        oComponent.getRouter().navTo("Screen0", {}, true);
        return new Promise(function () {});
      }

      var self = this;
      this._log("_ensureUserInfosLoaded: reloading UserInfos from backend...");
      BusyIndicator.show(0);

      return new Promise(function (resolve, reject) {
        oModel.metadataLoaded().then(function () {
          // Use the same userId as Screen0 — read from vm or default
          var sUserId = oVm.getProperty("/userId") || "E_ZEMAF";
          var sPath = "/UserInfosSet('" + sUserId + "')";

          oModel.read(sPath, {
            urlParameters: {
              "$expand": "UserInfosDomains/DomainsValues,UserInfosMMCT/UserMMCTFields,UserInfosVend",
              "sap-language": "IT"
            },
            success: function (oData) {
              BusyIndicator.hide();
              if (!oData) {
                self._log("_ensureUserInfosLoaded: no data returned, redirecting to Screen0");
                oComponent.getRouter().navTo("Screen0", {}, true);
                reject();
                return;
              }

              var sUserType = oData.UserType || "";
              var aDomains = (oData.UserInfosDomains && oData.UserInfosDomains.results) || [];
              var aMMCT = (oData.UserInfosMMCT && oData.UserInfosMMCT.results) || [];
              var aVend = (oData.UserInfosVend && oData.UserInfosVend.results) || [];

              var domainsByName = aDomains.reduce(function (acc, d) {
                acc[d.Domain] = ((d.DomainsValues && d.DomainsValues.results) || []).map(function (x) {
                  return { key: x.Value, text: x.Descrizione };
                });
                return acc;
              }, {});

              var domainsByKey = Object.keys(domainsByName).reduce(function (acc, dom) {
                var m = {};
                (domainsByName[dom] || []).forEach(function (it) { m[it.key] = it.text; });
                acc[dom] = m;
                return acc;
              }, {});

              var aAllFields = aMMCT.reduce(function (acc, cat) {
                return acc.concat((cat.UserMMCTFields && cat.UserMMCTFields.results) || []);
              }, []);

              var mmctFieldsByCat = aAllFields.reduce(function (acc, f) {
                var c = f && f.CatMateriale;
                if (!c) return acc;
                if (!acc[c]) acc[c] = [];
                acc[c].push(f);
                return acc;
              }, {});

              var t = String(sUserType || "").trim().toUpperCase();
              var auth = {
                role: (t === "E" ? "FORNITORE" : (t === "I" ? "VALENTINO" : (t === "S" ? "SUPERUSER" : "UNKNOWN"))),
                isSupplier: t === "E", isValentino: t === "I", isSuperuser: t === "S"
              };

              oVm.setData({
                userId: sUserId,
                userType: sUserType,
                userDescription: oData.UserDescription || "",
                showAggregatedTile: sUserType !== "E",
                auth: auth,
                mock: oVm.getProperty("/mock") || {},
                userDomains: aDomains,
                userCategories: aMMCT,
                userVendors: aVend,
                userMMCT: aMMCT,
                mmctFieldsByCat: mmctFieldsByCat,
                UserInfosMMCT: aMMCT,
                UserInfosVend: aVend,
                UserInfosDomains: aDomains,
                domainsByName: domainsByName,
                domainsByKey: domainsByKey,
                mdcCfg: oVm.getProperty("/mdcCfg") || {},
                cache: oVm.getProperty("/cache") || { dataRowsByKey: {}, recordsByKey: {} }
              }, true);

              self._log("_ensureUserInfosLoaded: OK", {
                userId: sUserId, userType: sUserType,
                vendors: aVend.length, mmctCats: Object.keys(mmctFieldsByCat).length
              });
              resolve();
            },
            error: function (oError) {
              BusyIndicator.hide();
              console.error("[BaseController] _ensureUserInfosLoaded ERROR", oError);
              oComponent.getRouter().navTo("Screen0", {}, true);
              reject(oError);
            }
          });
        }).catch(function (err) {
          BusyIndicator.hide();
          console.error("[BaseController] _ensureUserInfosLoaded metadata ERROR", err);
          oComponent.getRouter().navTo("Screen0", {}, true);
          reject(err);
        });
      });
    },

    // ==================== NAVIGATION ====================

    onNavBack: function () {
      if (typeof this._hasUnsavedChanges === "function" && this._hasUnsavedChanges()) {
        var self = this;
        sap.m.MessageBox.warning(
          "Hai modificato i dati. Sei sicuro di voler uscire senza salvare?",
          {
            title: "Modifiche non salvate",
            actions: [sap.m.MessageBox.Action.OK, sap.m.MessageBox.Action.CANCEL],
            emphasizedAction: sap.m.MessageBox.Action.CANCEL,
            onClose: function (s) {
              if (s === sap.m.MessageBox.Action.OK) self._performNavBack();
            }
          }
        );
      } else {
        this._performNavBack();
      }
    },

    _performNavBack: function () {
      var sPreviousHash = History.getInstance().getPreviousHash();
      if (sPreviousHash !== undefined) {
        window.history.go(-1);
      } else {
        var fb = this._getNavBackFallback();
        this.getOwnerComponent().getRouter().navTo(fb.route, fb.params, true);
      }
    },

    _getNavBackFallback: function () {
      return { route: "Screen0", params: {} };
    }
  });
});