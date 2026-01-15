// webapp/controller/Screen0.controller.js
sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/ui/core/BusyIndicator",
  "apptracciabilita/apptracciabilita/util/domainFallback",
  "sap/m/MessageToast",
  "apptracciabilita/apptracciabilita/util/mockData"
], function (Controller, JSONModel, BusyIndicator, DomainFallback, MessageToast, MockData) {
  "use strict";

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

      try {
        MessageToast.show("Backend non raggiungibile");
      } catch (e2) { /* ignore */ }

      // log tecnico (ti serve per capire cosa è successo)
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

      // installa una sola volta
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

      // 1) metadataFailed (il tuo caso: $metadata 503)
      if (typeof oModel.attachMetadataFailed === "function") {
        oModel.attachMetadataFailed(function (oEvent) {
          var info = extractInfoFromEvent(oEvent);
          // se è 503/0 ecc., lo consideriamo backend down
          that._handleBackendDown(Object.assign({ where: "attachMetadataFailed" }, info));
        });
      }

      // 2) requestFailed (catch generale)
      if (typeof oModel.attachRequestFailed === "function") {
        oModel.attachRequestFailed(function (oEvent) {
          var info = extractInfoFromEvent(oEvent);
          var sc = parseInt(info.statusCode, 10);

          // intercetto i casi tipici di backend giù / gateway / timeout
          if (sc === 0 || sc === 502 || sc === 503 || sc === 504) {
            that._handleBackendDown(Object.assign({ where: "attachRequestFailed" }, info));
          }
        });
      }

      // 3) metadataLoaded().catch (copre il caso “già fallito prima dell’onInit”)
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

        // preservo flags mock già settati
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

      var oComponent = this.getOwnerComponent();

      // 1) Intercetta subito errori $metadata / requestFailed
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

        // usato dai controller 3/4 per delegate cfg
        mdcCfg: {},

        // cache usata da Screen3/4
        cache: {
          dataRowsByKey: {},
          recordsByKey: {}
        },

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

          // flags per schermata
          mockS0: false,
          mockS1: false,
          mockS2: false,
          mockS3: false,
          mockS4: false
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
      // MOCK SWITCHES (EDITA QUI, SOLO QUI)
      // =========================================================
      var sUserId = "E_ZEMAF";

      var bMockS0 = false; 
      var bMockS1 = false; 
      var bMockS2 = false;  
      var bMockS3 = false;  
      var bMockS4 = false;  

      var iVendorIdx = 0;   
      var sForceStato = "";

      // solo se fai mock S0: tipo utente mock
      var sMockUserType = "E"; // "E" / "I" / "S"

      // opzionale: override userType anche quando NON mockS0 (lascia "" per non forzare)
      var sOverrideUserTypeWhenReal = "E"; // es: "E"

      // se backend giù, fai fallback automatico su mock (consigliato)
      var bAutoFallbackToMockWhenBackendDown = true;

      // pubblica sempre in vm (tutti i controller leggono da qui)
      oVm.setProperty("/mock", {
        vendorIdx: iVendorIdx,
        forceStato: sForceStato,
        mockS0: !!bMockS0,
        mockS1: !!bMockS1,
        mockS2: !!bMockS2,
        mockS3: !!bMockS3,
        mockS4: !!bMockS4
      });

      // =========================================================
      // MOCK S0: VM completo senza OData
      // =========================================================
      if (bMockS0) {
        MockData.applyVm(oVm, { userId: sUserId, userType: sMockUserType });

        oVm.setProperty("/mock", {
          vendorIdx: iVendorIdx,
          forceStato: sForceStato,
          mockS0: !!bMockS0,
          mockS1: !!bMockS1,
          mockS2: !!bMockS2,
          mockS3: !!bMockS3,
          mockS4: !!bMockS4
        });

        console.log("[Screen0][MOCK] applyVm OK", {
          userId: oVm.getProperty("/userId"),
          userType: oVm.getProperty("/userType"),
          mock: oVm.getProperty("/mock")
        });

        return;
      }

      // =========================================================
      // PATH NORMALE: OData read UserInfosSet(...)
      // =========================================================
      var oModel = oComponent.getModel();

      // se il model non esiste / non è pronto, intercetto + fallback mock
      if (!oModel || typeof oModel.read !== "function") {
        this._handleBackendDown({ where: "onInit", message: "ODataModel non disponibile (probabile metadata KO)" });
        if (bAutoFallbackToMockWhenBackendDown) {
          this._applyMockFallbackNow(oVm, { userId: sUserId, userType: sMockUserType });
        }
        return;
      }

      // Intercetta proprio il tuo caso: metadata 503
      if (typeof oModel.metadataLoaded === "function") {
        BusyIndicator.show(0);

        oModel.metadataLoaded().then(function () {
          // ok: metadata disponibile -> procedo come prima

          var sPath = "/UserInfosSet('" + sUserId + "')";

          oModel.read(sPath, {
            urlParameters: {
              "$expand": "UserInfosDomains/DomainsValues,UserInfosMMCT/UserMMCTFields,UserInfosVend",
              "sap-language": "IT"
            },
            success: function (oData) {
              BusyIndicator.hide();

              if (!oData) {
                console.error("UserInfosSet: nessun dato restituito per", sUserId);
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

              // === DOMAIN FALLBACK (se attivo) ===
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
                } catch (e) {
                  bEnabled = false;
                }

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
                  console.warn("[Screen0][DomainFallback] apply() error, uso fallback inline:", e1);
                }

                function norm(s) { return String(s || "").trim(); }
                function makeMockDomain(f) {
                  return "__MOCK__" + norm(f.CatMateriale) + "__" + norm(f.Fieldname || f.UiFieldname || "FIELD");
                }
                function getMockValues(f) {
                  try {
                    if (DomainFallback && typeof DomainFallback.getMockValues === "function") {
                      var a = DomainFallback.getMockValues(f);
                      if (Array.isArray(a) && a.length) return a;
                    }
                  } catch (e2) { /* ignore */ }
                  return ["val1", "val2", "val3", "val4", "val5"];
                }

                var aMocked = [];
                var aPatched = aAllFields.map(function (f) {
                  if (!f) return f;

                  var isMulti = (String(f.MultipleVal || "") === "X");
                  if (!isMulti) return f;

                  var dom = norm(f.Dominio);
                  var hasDomValues = dom && Array.isArray(domainsByName[dom]) && domainsByName[dom].length > 0;

                  if (hasDomValues) return f;

                  var sMockDom = makeMockDomain(f);

                  if (!Array.isArray(domainsByName[sMockDom]) || domainsByName[sMockDom].length === 0) {
                    domainsByName[sMockDom] = getMockValues(f).map(function (v) {
                      return { key: v, text: v };
                    });
                  }

                  var f2 = Object.assign({}, f, { Dominio: sMockDom });
                  aMocked.push({ Cat: f2.CatMateriale, Field: f2.Fieldname, Dom: f2.Dominio });
                  return f2;
                });

                aAllFields = aPatched;

                if (aMocked.length) {
                  console.log("[Screen0][DomainFallback] ON - mocked fields:", aMocked);
                } else {
                  console.log("[Screen0][DomainFallback] ON - nothing to mock");
                }
              })();

              // domainsByKey: Domain -> { key: text }
              var domainsByKey = Object.keys(domainsByName).reduce(function (acc, dom) {
                var m = {};
                (domainsByName[dom] || []).forEach(function (it) {
                  m[it.key] = it.text;
                });
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

                mock: {
                  vendorIdx: iVendorIdx,
                  forceStato: sForceStato,
                  mockS0: !!bMockS0,
                  mockS1: !!bMockS1,
                  mockS2: !!bMockS2,
                  mockS3: !!bMockS3,
                  mockS4: !!bMockS4
                },

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

                // preserva cfg/cache se già presenti
                mdcCfg: oVm.getProperty("/mdcCfg") || {},
                cache: oVm.getProperty("/cache") || { dataRowsByKey: {}, recordsByKey: {} }
              }, true);

              console.log("[Screen0] userType:", sUserType, "auth:", oVm.getProperty("/auth"), "mock:", oVm.getProperty("/mock"));

            }.bind(this),
            error: function (oError) {
              BusyIndicator.hide();

              // qui intercetti anche le chiamate normali se backend torna giù
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
          // METADATA KO (il tuo caso): hide busy + toast
          BusyIndicator.hide();
          this._handleBackendDown({
            where: "metadataLoaded().catch in onInit",
            statusCode: err && (err.statusCode || err.status),
            message: (err && err.message) || String(err || "")
          });

          // fallback a mock, così l'app resta usabile
          if (bAutoFallbackToMockWhenBackendDown) {
            this._applyMockFallbackNow(oVm, { userId: sUserId, userType: sMockUserType });
          }
        }.bind(this));

        return;
      }

      // se metadataLoaded non esiste, continuo come prima (ma in pratica sui v2 c'è)
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
