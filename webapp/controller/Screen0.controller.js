sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/ui/core/BusyIndicator",
  "sap/m/MessageToast",
  "apptracciabilita/apptracciabilita/util/normalize"
], function (Controller, JSONModel, BusyIndicator, MessageToast, N) {
  "use strict";

  return Controller.extend("apptracciabilita.apptracciabilita.controller.Screen0", {

    // =========================================================
    // HANDLER CENTRALIZZATO "BACKEND DOWN"
    // =========================================================
    _handleBackendDown: function (info, oError) {
      try {
        var oModel = this.getOwnerComponent && this.getOwnerComponent().getModel && this.getOwnerComponent().getModel();
        if (oModel && oModel.__vendTraceBackendDownToastShown) return;
        if (oModel) oModel.__vendTraceBackendDownToastShown = true;
      } catch (e0) { /* ignore */ }

      try { BusyIndicator.hide(); } catch (e1) { /* ignore */ }

      var sMsg = "Backend non raggiungibile";
      try {
        if (oError && N && N.getBackendErrorMessage) {
          sMsg = N.getBackendErrorMessage(oError);
        }
      } catch (e3) { /* ignore */ }

      try { MessageToast.show(sMsg); } catch (e2) { /* ignore */ }

      console.error("[Screen0][BACKEND DOWN]", sMsg, info || {});
    },

    // =========================================================
    // INSTALLA GUARD SU ODATA (metadataFailed / requestFailed / metadataLoaded.catch)
    // =========================================================
    _installODataGuards: function () {
      var oComponent = this.getOwnerComponent();
      if (!oComponent || !oComponent.getModel) return;

      var oModel = oComponent.getModel();
      if (!oModel) return;

      if (oModel.__vendTraceGuardsInstalled) return;
      oModel.__vendTraceGuardsInstalled = true;

      var that = this;

      function extractInfoFromEvent(oEvent) {
        try {
          var resp = oEvent && oEvent.getParameter && oEvent.getParameter("response");
          var msg = oEvent && oEvent.getParameter && oEvent.getParameter("message");
          return {
            statusCode: resp && (resp.statusCode || resp.status),
            statusText: resp && resp.statusText,
            requestUri: resp && (resp.requestUri || resp.url),
            message: msg
          };
        } catch (e) {
          return {};
        }
      }

      if (typeof oModel.attachMetadataFailed === "function") {
        oModel.attachMetadataFailed(function (oEvent) {
          var info = extractInfoFromEvent(oEvent);
          that._handleBackendDown(Object.assign({ where: "attachMetadataFailed" }, info));
        });
      }

      if (typeof oModel.attachRequestFailed === "function") {
        oModel.attachRequestFailed(function (oEvent) {
          var info = extractInfoFromEvent(oEvent);
          var sc = parseInt(info.statusCode, 10);
          if (sc === 0 || sc === 502 || sc === 503 || sc === 504) {
            that._handleBackendDown(Object.assign({ where: "attachRequestFailed" }, info));
          }
        });
      }

      if (typeof oModel.metadataLoaded === "function") {
        try {
          oModel.metadataLoaded().catch(function (err) {
            var info = {
              where: "metadataLoaded().catch",
              statusCode: err && (err.statusCode || err.status),
              message: (err && err.message) || String(err || "")
            };
            that._handleBackendDown(info, err);
          });
        } catch (e3) {
          that._handleBackendDown({ where: "metadataLoaded().catch (throw)", message: e3 && e3.message });
        }
      }
    },

    onInit: function () {
      var oComponent = this.getOwnerComponent();

      this._installODataGuards();

      var oVm = new JSONModel({
        userId: "",
        userType: "",
        userDescription: "",
        showAggregatedTile: false,
        userCategories: [],
        userVendors: [],
        userDomains: [],
        domainsByKey: {},
        domainsByName: {},
        userMMCT: [],
        mmctFieldsByCat: {},
        cache: {
          dataRowsByKey: {},
          recordsByKey: {}
        },
        mdcCfg: {},
        auth: {
          role: "UNKNOWN",
          isSupplier: false,
          isValentino: false,
          isSuperuser: false
        }
      });
      oVm.setSizeLimit(100000);

      oComponent.setModel(oVm, "vm");

      function buildAuth(userType) {
        var t = String(userType || "").trim().toUpperCase();
        return {
          role: (t === "E" ? "FORNITORE" : (t === "I" ? "VALENTINO" : (t === "S" ? "SUPERUSER" : "UNKNOWN"))),
          isSupplier: t === "E",
          isValentino: t === "I",
          isSuperuser: t === "S"
        };
      }

      var sUserId = "";
      var sOverrideUserTypeWhenReal = "";
      var oModel = oComponent.getModel();

      if (!oModel || typeof oModel.read !== "function") {
        this._handleBackendDown({ where: "onInit", message: "ODataModel non disponibile (probabile metadata KO)" });
        return;
      }

      if (typeof oModel.metadataLoaded !== "function") {
        this._handleBackendDown({ where: "onInit", message: "metadataLoaded() non disponibile" });
        return;
      }

      BusyIndicator.show(0);

      oModel.metadataLoaded().then(function () {
        var sPath = "/UserInfosSet('" + sUserId + "')";

        oModel.read(sPath, {
          urlParameters: {
            "$expand": "UserInfosDomains/DomainsValues,UserInfosMMCT/UserMMCTFields",
            "sap-language": "IT"
          },
          success: function (oData) {
            BusyIndicator.hide();

            if (!oData) {
              console.error("[Screen0] UserInfosSet: nessun dato restituito per", sUserId);
              return;
            }

            var sUserType = oData.UserType;
            if (sOverrideUserTypeWhenReal) {
              sUserType = String(sOverrideUserTypeWhenReal || "").trim().toUpperCase();
            }

            var aDomains = (oData.UserInfosDomains && oData.UserInfosDomains.results) || [];
            var aMMCT = (oData.UserInfosMMCT && oData.UserInfosMMCT.results) || [];
            var aVend = [];

            var domainsByName = aDomains.reduce(function (acc, d) {
              var sDom = d.Domain;
              acc[sDom] = ((d.DomainsValues && d.DomainsValues.results) || []).map(function (x) {
                return { key: x.Value, text: x.Descrizione };
              });
              return acc;
            }, {});

            var aAllFields = aMMCT.reduce(function (acc, cat) {
              var aFields = (cat.UserMMCTFields && cat.UserMMCTFields.results) || [];
              return acc.concat(aFields);
            }, []);

            var domainsByKey = Object.keys(domainsByName).reduce(function (acc, dom) {
              var m = {};
              (domainsByName[dom] || []).forEach(function (it) { m[it.key] = it.text; });
              acc[dom] = m;
              return acc;
            }, {});

            var mmctFieldsByCat = aAllFields.reduce(function (acc, f) {
              var c = f && f.CatMateriale;
              if (!c) return acc;
              if (!acc[c]) acc[c] = [];
              acc[c].push(f);
              return acc;
            }, {});

            aMMCT.forEach(function (cat) {
              var c = cat.CatMateriale;
              if (cat.UserMMCTFields && cat.UserMMCTFields.results && mmctFieldsByCat[c]) {
                cat.UserMMCTFields.results = mmctFieldsByCat[c];
              }
            });

            oVm.setData({
              userId: sUserId,
              userType: sUserType,
              userDescription: oData.UserDescription || "",
              showAggregatedTile: (sUserType === "I" || sUserType === "S"),
              auth: buildAuth(sUserType),
              userDomains: aDomains,
              userCategories: aMMCT,
              userVendors: aVend,
              userMMCT: aMMCT,
              mmctFieldsByCat: mmctFieldsByCat,
              UserInfosMMCT: oData.UserInfosMMCT?.results || [],
              UserInfosVend: [],
              UserInfosDomains: oData.UserInfosDomains?.results || [],
              domainsByName: domainsByName,
              domainsByKey: domainsByKey,
              mdcCfg: oVm.getProperty("/mdcCfg") || {},
              cache: oVm.getProperty("/cache") || { dataRowsByKey: {}, recordsByKey: {} }
            }, true);
          }.bind(this),
          error: function (oError) {
            BusyIndicator.hide();
            this._handleBackendDown({
              where: "UserInfosSet.read error",
              statusCode: oError && oError.statusCode,
              message: (oError && oError.message) || "Errore lettura UserInfosSet"
            }, oError);
          }.bind(this)
        });
      }.bind(this)).catch(function (err) {
        BusyIndicator.hide();
        this._handleBackendDown({
          where: "metadataLoaded().catch in onInit",
          statusCode: err && (err.statusCode || err.status),
          message: (err && err.message) || String(err || "")
        }, err);
      }.bind(this));
    },

    // =========================================================
    // LAZY VENDOR LOADING
    // =========================================================
    _vendorPromise: null,

    _ensureVendorsLoaded: function () {
      var oVm = this.getOwnerComponent().getModel("vm");
      if (oVm && oVm.getProperty("/__vendorCacheStale")) {
        this._vendorPromise = null;
        oVm.setProperty("/__vendorCacheStale", false);
      }

      if (this._vendorPromise) return this._vendorPromise;

      var aExisting = oVm.getProperty("/userVendors") || [];
      if (aExisting.length) {
        this._vendorPromise = Promise.resolve(aExisting);
        return this._vendorPromise;
      }

      var oModel = this.getOwnerComponent().getModel();
      var self = this;

      this._vendorPromise = new Promise(function (resolve, reject) {
        BusyIndicator.show(0);
        oModel.read("/VendorDataSet", {
          urlParameters: { "sap-language": "IT", "$top": "99999" },
          success: function (oData) {
            BusyIndicator.hide();
            var aVend = (oData && oData.results) || [];
            oVm.setProperty("/userVendors", aVend);
            oVm.setProperty("/UserInfosVend", aVend);
            resolve(aVend);
          },
          error: function (oError) {
            BusyIndicator.hide();
            console.error("[Screen0] VendorDataSet ERROR", oError);
            self._vendorPromise = null;
            reject(oError);
          }
        });
      });

      return this._vendorPromise;
    },

    onPressFlowA: function () {
      var oRouter = this.getOwnerComponent().getRouter();
      var oVm = this.getOwnerComponent().getModel("vm");

      var sUserType = (oVm && oVm.getProperty("/userType")) || "";
      sUserType = String(sUserType || "").trim().toUpperCase();

      this._ensureVendorsLoaded().then(function () {
        if (sUserType === "E") {
          var aVend = (oVm && oVm.getProperty("/userVendors")) || (oVm && oVm.getProperty("/UserInfosVend")) || [];
          var oV = aVend[2] || aVend[0] || null;
          var sVendorId = oV && (oV.Fornitore || oV.VENDOR || oV.Lifnr);

          if (!sVendorId) {
            MessageToast.show("Nessun fornitore trovato per navigare a Screen2");
            console.error("[Screen0] Fornitore senza userVendors/UserInfosVend");
            oRouter.navTo("Screen1", { mode: "A" });
            return;
          }

          oRouter.navTo("Screen2", {
            vendorId: encodeURIComponent(String(sVendorId)),
            mode: "A"
          });
          return;
        }

        oRouter.navTo("Screen1", { mode: "A" });
      }).catch(function (err) {
        console.error("[Screen0] onPressFlowA vendor load failed", err);
        MessageToast.show(N.getBackendErrorMessage(err));
      });
    },

    onPressFlowB: function () {
      this.getOwnerComponent().getRouter().navTo("Screen6");
    },

    onPressFlowC: function () {
      this.getOwnerComponent().getRouter().navTo("Screen5");
    }
  });
});
