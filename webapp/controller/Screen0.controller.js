sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/ui/core/BusyIndicator",
  "apptracciabilita/apptracciabilita/util/domainFallback",
  "sap/m/MessageToast"
], function (Controller, JSONModel, BusyIndicator, DomainFallback, MessageToast) {
  "use strict";

  return Controller.extend("apptracciabilita.apptracciabilita.controller.Screen0", {
    onInit: function () {

      var oComponent = this.getOwnerComponent();

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

        // mock centralizzato (hardcoded qui)
        mock: {
          vendorIdx: 0,      // vendor usato per skip Screen1 (fornitore)
          forceStato: "",    // "ST"|"AP"|"RJ"|"CH"|""  -> forza lo stato in Screen3/4
          mockS3: false      // true -> Screen3 usa dataset mock
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

      var oModel = oComponent.getModel();
      var sUserId = "E_ZEMAF";

      var sPath = "/UserInfosSet('" + sUserId + "')";

      BusyIndicator.show(0);
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

          /* QUI MOCK PER UTENTE */
          sUserType = "E";

          /* QUI MOCK PER STATO (opzionale) */
          // var sForceStato = "AP"; // ST / AP / RJ / CH
          var sForceStato = "";

          /* QUI MOCK PER DATASET SCREEN3 (opzionale) */
          // var bMockS3 = true;
          var bMockS3 = false;

          /* QUI MOCK vendor index (per skip Screen1) */
          var iVendorIdx = 0;

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

          // === DOMAIN FALLBACK (MOCK removibile) ===
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
              mockS3: bMockS3
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
          console.error("Errore lettura UserInfosSet('" + sUserId + "')", oError);
        }
      });
    },

    onPressFlowA: function () {
      var oRouter = this.getOwnerComponent().getRouter();
      var oVm = this.getOwnerComponent().getModel("vm");

      var sUserType = (oVm && oVm.getProperty("/userType")) || "";
      sUserType = String(sUserType || "").trim().toUpperCase();

      // Se FORNITORE: salto Screen1 e vado diretto a Screen2 col vendor [0]
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

      // altri ruoli: comportamento standard
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
