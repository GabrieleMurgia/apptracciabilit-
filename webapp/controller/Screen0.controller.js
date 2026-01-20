sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/ui/core/BusyIndicator",
  "apptracciabilita/apptracciabilita/util/domainFallback",
  "sap/m/MessageToast",
  "apptracciabilita/apptracciabilita/util/mockData"
], function (Controller, JSONModel, BusyIndicator, DomainFallback, MessageToast, MockData) {
  "use strict";

  function ts() { return new Date().toISOString(); }

  return Controller.extend("apptracciabilita.apptracciabilita.controller.Screen0", {

    // =========================================================
    // HANDLER CENTRALIZZATO "BACKEND DOWN"
    // =========================================================
    _handleBackendDown: function (info) {
      try {
        var oModel = this.getOwnerComponent && this.getOwnerComponent().getModel && this.getOwnerComponent().getModel();
        if (oModel && oModel.__vendTraceBackendDownToastShown) return;
        if (oModel) oModel.__vendTraceBackendDownToastShown = true;
      } catch (e0) { /* ignore */ }

      try { BusyIndicator.hide(); } catch (e1) { /* ignore */ }

      try { MessageToast.show("Backend non raggiungibile"); } catch (e2) { /* ignore */ }

      console.error("[Screen0][BACKEND DOWN]", info || {});
    },

    // =========================================================
    // INSTALLA GUARD SU ODATA (metadataFailed / requestFailed / metadataLoaded.catch)
    // =========================================================
    _installODataGuards: function () {
      var oComponent = this.getOwnerComponent();
      if (!oComponent || !oComponent.getModel) return;

      var oModel = oComponent.getModel(); // default ODataModel
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

      // 1) metadataFailed (es: $metadata 503)
      if (typeof oModel.attachMetadataFailed === "function") {
        oModel.attachMetadataFailed(function (oEvent) {
          var info = extractInfoFromEvent(oEvent);
          that._handleBackendDown(Object.assign({ where: "attachMetadataFailed" }, info));
        });
      }

      // 2) requestFailed (catch generale)
      if (typeof oModel.attachRequestFailed === "function") {
        oModel.attachRequestFailed(function (oEvent) {
          var info = extractInfoFromEvent(oEvent);
          var sc = parseInt(info.statusCode, 10);
          if (sc === 0 || sc === 502 || sc === 503 || sc === 504) {
            that._handleBackendDown(Object.assign({ where: "attachRequestFailed" }, info));
          }
        });
      }

      // 3) metadataLoaded().catch (copre “già fallito”)
      if (typeof oModel.metadataLoaded === "function") {
        try {
          oModel.metadataLoaded().catch(function (err) {
            var info = {
              where: "metadataLoaded().catch",
              statusCode: err && (err.statusCode || err.status),
              message: (err && err.message) || String(err || "")
            };
            that._handleBackendDown(info);
          });
        } catch (e3) {
          that._handleBackendDown({ where: "metadataLoaded().catch (throw)", message: e3 && e3.message });
        }
      }
    },

    // =========================================================
    // FALLBACK AUTOMATICO A MOCK SE BACKEND DOWN
    // =========================================================
    _applyMockFallbackNow: function (oVm, opts) {
      try {
        if (!oVm) return;

        MockData.applyVm(oVm, {
          userId: opts.userId,
          userType: opts.userType
        });

        var mock = oVm.getProperty("/mock") || {};
        oVm.setProperty("/mock", Object.assign({}, mock, { mockS0: true }));

        console.log("[Screen0][MOCK FALLBACK] applyVm OK", {
          userId: oVm.getProperty("/userId"),
          userType: oVm.getProperty("/userType"),
          mock: oVm.getProperty("/mock")
        });
      } catch (e) {
        console.error("[Screen0][MOCK FALLBACK] ERROR", e);
      }
    },

    onInit: function () {
      console.log("[Screen0] " + ts() + " onInit START");

      var oComponent = this.getOwnerComponent();

      // 1) Intercetta subito errori $metadata / requestFailed
      this._installODataGuards();

      // =========================================================
      // VM (globale)
      // =========================================================
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

        // cache usata da Screen2/3/4
        cache: {
          dataRowsByKey: {},
          recordsByKey: {}
        },

        // config MDC eventuale
        mdcCfg: {},

        // auth/permessi (derivati da userType)
        auth: {
          role: "UNKNOWN",
          isSupplier: false,
          isValentino: false,
          isSuperuser: false
        },

        // mock centralizzato
        mock: {
          vendorIdx: 0,
          forceStato: "",
          mockS0: false,
          mockS1: false,
          mockS2: false,
          mockS3: false,
          mockS4: false,
          files: {
            userInfos: "",
            materials: "",
            dataSet: ""
          }
        }
      });

      oComponent.setModel(oVm, "vm");

      function buildAuth(userType) {
        var t = String(userType || "").trim().toUpperCase(); // I/E/S
        return {
          role: (t === "E" ? "FORNITORE" : (t === "I" ? "VALENTINO" : (t === "S" ? "SUPERUSER" : "UNKNOWN"))),
          isSupplier: t === "E",
          isValentino: t === "I",
          isSuperuser: t === "S"
        };
      }

      // =========================================================
      // MOCK SWITCHES 
      // =========================================================
      var sUserId = "E_ZEMAF";

      var sMockUserInfosFile = "mock/UserInfosSet.json";
      var sMockMaterialsFile = "mock/MaterialDataSet.json";
      var sMockDataSetFile = "mock/DataSet.json";

      var bMockS0 = true;
      var bMockS1 = true;
      var bMockS2 = true;
      var bMockS3 = true;
      var bMockS4 = true;

      var iVendorIdx = 0;
      var sForceStato = "";

      // tipo utente mock
      var sMockUserType = "E"; // "E" / "I" / "S"

      // override userType
      var sOverrideUserTypeWhenReal = "E"; // es: "I"

      // se backend giù, fai fallback automatico su mock (consigliato)
      var bAutoFallbackToMockWhenBackendDown = true;

      oVm.setProperty("/mock", {
        vendorIdx: iVendorIdx,
        forceStato: sForceStato,
        mockS0: !!bMockS0,
        mockS1: !!bMockS1,
        mockS2: !!bMockS2,
        mockS3: !!bMockS3,
        mockS4: !!bMockS4,
        files: {
          userInfos: sMockUserInfosFile,
          materials: sMockMaterialsFile,
          dataSet: sMockDataSetFile
        }
      });

      // =========================================================
      // MOCK S0: VM completo senza OData (da file)
      // =========================================================
      if (bMockS0) {
        debugger
        BusyIndicator.show(0);

        MockData.applyVmFromFile(oVm, {
          path: sMockUserInfosFile,
          userId: sUserId,
          userType: sMockUserType
        }).then(function () {
          BusyIndicator.hide();

          // riallineo flags mock
          oVm.setProperty("/mock", {
            vendorIdx: iVendorIdx,
            forceStato: sForceStato,
            mockS0: !!bMockS0,
            mockS1: !!bMockS1,
            mockS2: !!bMockS2,
            mockS3: !!bMockS3,
            mockS4: !!bMockS4,
            files: {
              userInfos: sMockUserInfosFile,
              materials: sMockMaterialsFile,
              dataSet: sMockDataSetFile
            }
          });

          console.log("[Screen0][MOCK FILE] UserInfosSet OK", {
            userId: oVm.getProperty("/userId"),
            userType: oVm.getProperty("/userType"),
            vendors: (oVm.getProperty("/userVendors") || []).length,
            mmctCats: (oVm.getProperty("/userMMCT") || []).length
          });

        }).catch(function (err) {
          BusyIndicator.hide();
          console.error("[Screen0][MOCK FILE] UserInfosSet ERROR -> fallback hardcoded", err);

          MockData.applyVm(oVm, { userId: sUserId, userType: sMockUserType });

          MessageToast.show("MOCK UserInfosSet.json NON CARICATO (vedi Console/Network)");
        });

        return;
      }

      // =========================================================
      // PATH NORMALE: 
      // =========================================================
      var oModel = oComponent.getModel();

      if (!oModel || typeof oModel.read !== "function") {
        this._handleBackendDown({ where: "onInit", message: "ODataModel non disponibile (probabile metadata KO)" });
        if (bAutoFallbackToMockWhenBackendDown) {
          this._applyMockFallbackNow(oVm, { userId: sUserId, userType: sMockUserType });
        }
        return;
      }

      if (typeof oModel.metadataLoaded === "function") {
        BusyIndicator.show(0);

        oModel.metadataLoaded().then(function () {

          var sPath = "/UserInfosSet('" + sUserId + "')";

          oModel.read(sPath, {
            urlParameters: {
              "$expand": "UserInfosDomains/DomainsValues,UserInfosMMCT/UserMMCTFields,UserInfosVend",
              "sap-language": "IT"
            },
            success: function (oData) {
              BusyIndicator.hide();

              debugger

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
              var aVend = (oData.UserInfosVend && oData.UserInfosVend.results) || [];

              // domainsByName: Domain -> [{key,text}]
              var domainsByName = aDomains.reduce(function (acc, d) {
                var sDom = d.Domain;
                acc[sDom] = ((d.DomainsValues && d.DomainsValues.results) || []).map(function (x) {
                  var v = x.Value;
                  return { key: v, text: v };
                });
                return acc;
              }, {});

              // === raccogli tutti i fields MMCT in una lista unica ===
              var aAllFields = aMMCT.reduce(function (acc, cat) {
                var aFields = (cat.UserMMCTFields && cat.UserMMCTFields.results) || [];
                return acc.concat(aFields);
              }, []);

              // === DOMAIN FALLBACK ===
              (function applyDomainFallbackIfNeeded() {
                var bEnabled = false;

                try {
                  if (DomainFallback && typeof DomainFallback.isEnabled === "function") {
                    bEnabled = !!DomainFallback.isEnabled();
                  } else {
                    var qs = (window && window.location && window.location.search) || "";
                    bEnabled = /(?:\?|&)mockDom=1(?:&|$)/.test(qs) ||
                      (window && window.localStorage && window.localStorage.getItem("VENDTRACE_MOCK_DOMAIN_FALLBACK") === "1");
                  }
                } catch (e) { bEnabled = false; }

                if (!bEnabled) return;

                try {
                  if (DomainFallback && typeof DomainFallback.apply === "function") {
                    var r = DomainFallback.apply(domainsByName, aAllFields);
                    domainsByName = (r && (r.domainsByName || r.domainsByNamePatched || r.domains)) || domainsByName;
                    aAllFields = (r && (r.fields || r.fieldsPatched)) || aAllFields;

                    if (r && r.logs && Array.isArray(r.logs) && r.logs.length) {
                      console.log("[Screen0][DomainFallback] ON - logs:", r.logs);
                    }
                    return;
                  }
                } catch (e1) {
                  console.warn("[Screen0][DomainFallback] apply() error:", e1);
                }
              })();

              // domainsByKey: Domain -> { key: text }
              var domainsByKey = Object.keys(domainsByName).reduce(function (acc, dom) {
                var m = {};
                (domainsByName[dom] || []).forEach(function (it) { m[it.key] = it.text; });
                acc[dom] = m;
                return acc;
              }, {});

              // mmctFieldsByCat: Cat -> raw fields[]
              var mmctFieldsByCat = aAllFields.reduce(function (acc, f) {
                var c = f && f.CatMateriale;
                if (!c) return acc;
                if (!acc[c]) acc[c] = [];
                acc[c].push(f);
                return acc;
              }, {});

              // preserva coerenza anche dentro aMMCT
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
                showAggregatedTile: sUserType !== "E",

                auth: buildAuth(sUserType),

                mock: oVm.getProperty("/mock") || {},

                userDomains: aDomains,
                userCategories: aMMCT,
                userVendors: aVend,

                userMMCT: aMMCT,
                mmctFieldsByCat: mmctFieldsByCat,

                UserInfosMMCT: oData.UserInfosMMCT?.results || [],
                UserInfosVend: oData.UserInfosVend?.results || [],
                UserInfosDomains: oData.UserInfosDomains?.results || [],

                domainsByName: domainsByName,
                domainsByKey: domainsByKey,

                mdcCfg: oVm.getProperty("/mdcCfg") || {},
                cache: oVm.getProperty("/cache") || { dataRowsByKey: {}, recordsByKey: {} }
              }, true);

              console.log("[Screen0] userType:", sUserType, "auth:", oVm.getProperty("/auth"), "mock:", oVm.getProperty("/mock"));

            }.bind(this),
            error: function (oError) {
              BusyIndicator.hide();

              this._handleBackendDown({
                where: "UserInfosSet.read error",
                statusCode: oError && oError.statusCode,
                message: (oError && oError.message) || "Errore lettura UserInfosSet"
              });

              if (bAutoFallbackToMockWhenBackendDown) {
                this._applyMockFallbackNow(oVm, { userId: sUserId, userType: sMockUserType });
              }
            }.bind(this)
          });

        }.bind(this)).catch(function (err) {
          BusyIndicator.hide();
          this._handleBackendDown({
            where: "metadataLoaded().catch in onInit",
            statusCode: err && (err.statusCode || err.status),
            message: (err && err.message) || String(err || "")
          });

          if (bAutoFallbackToMockWhenBackendDown) {
            this._applyMockFallbackNow(oVm, { userId: sUserId, userType: sMockUserType });
          }
        }.bind(this));

        return;
      }

      this._handleBackendDown({ where: "onInit", message: "metadataLoaded() non disponibile" });
      if (bAutoFallbackToMockWhenBackendDown) {
        this._applyMockFallbackNow(oVm, { userId: sUserId, userType: sMockUserType });
      }
    },

    onPressFlowA: function () {
      var oRouter = this.getOwnerComponent().getRouter();
      var oVm = this.getOwnerComponent().getModel("vm");

      var sUserType = (oVm && oVm.getProperty("/userType")) || "";
      sUserType = String(sUserType || "").trim().toUpperCase();

      // Se FORNITORE: salto Screen1 e vado diretto a Screen2 col vendor [vendorIdx]
      if (sUserType === "E") {
        var aVend = (oVm && oVm.getProperty("/userVendors")) || (oVm && oVm.getProperty("/UserInfosVend")) || [];
        var mock = (oVm && oVm.getProperty("/mock")) || {};
        var iIdx = parseInt(mock.vendorIdx || 0, 10);
        if (isNaN(iIdx) || iIdx < 0) iIdx = 0;

        var oV = aVend[iIdx] || aVend[0] || null;
        var sVendorId = oV && (oV.Fornitore || oV.VENDOR || oV.Lifnr);

        if (!sVendorId) {
          MessageToast.show("Nessun fornitore trovato per navigare a Screen2");
          console.error("[Screen0] Fornitore senza userVendors/UserInfosVend");
          oRouter.navTo("Screen1", { mode: "A" });
          return;
        }

        console.log("[Screen0] FORNITORE -> skip Screen1, vendor:", sVendorId);

        oRouter.navTo("Screen2", {
          vendorId: encodeURIComponent(String(sVendorId)),
          mode: "A"
        });
        return;
      }

      oRouter.navTo("Screen1", { mode: "A" });
    },

    onPressFlowB: function () {
      this.getOwnerComponent().getRouter().navTo("Screen1", { mode: "M" });
    },

    onPressFlowC: function () {
      this.getOwnerComponent().getRouter().navTo("Screen1", { mode: "T" });
    }
  });
});
