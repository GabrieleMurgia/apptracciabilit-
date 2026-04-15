sap.ui.define([
  "sap/ui/core/BusyIndicator",
  "sap/m/MessageToast",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "apptracciabilita/apptracciabilita/util/mockData",
  "apptracciabilita/apptracciabilita/util/mmctUtil",
  "apptracciabilita/apptracciabilita/util/normalize"
], function (BusyIndicator, MessageToast, Filter, FilterOperator, MockData, MmctUtil, N) {
  "use strict";

  return {

    /**
     * Costruisce i filtri comuni per le chiamate OData
     */
    buildCommonFilters: function (opts) {
      var sUserId = opts.userId;
      var sVendorId = opts.vendorId;
      var sMaterial = opts.material;
      var sSeason = opts.season;
      var sCatMateriale = opts.catMateriale || "";  // ← NoMatList: filtro per categoria

      var sVendor10 = N.normalizeVendor10(sVendorId);

      var aFilters = [
        new Filter("UserID", FilterOperator.EQ, sUserId),
        new Filter("Fornitore", FilterOperator.EQ, sVendor10)
      ];

      // ── NoMatList: filtro per categoria materiale, senza materiale/stagione ──
      if (sCatMateriale) {
        aFilters.push(new Filter("CatMateriale", FilterOperator.EQ, sCatMateriale));
        if (sSeason) {
          aFilters.push(new Filter("Stagione", FilterOperator.EQ, sSeason));
        }
        return aFilters;
      }

      // ── Flusso normale: filtro per materiale + stagione ──
      var sMatNorm = String(sMaterial || "").trim().toUpperCase();

      if (sSeason) {
        aFilters.push(new Filter("Stagione", FilterOperator.EQ, sSeason));
      }

      if (sMatNorm) {
        aFilters.push(new Filter("Materiale", FilterOperator.EQ, sMatNorm));
      }


      return aFilters;
    },

    /**
     * Carica i dati dal backend (DataSet + VendorBatchSet)
     *
     * opts.filtersVendorBatch (opzionale, NoMatList fix):
     *   Filtri separati per VendorBatchSet. Se non passato, usa opts.filters.
     *   Necessario perché VendorBatchSet non ha la proprietà CatMateriale.
     */
    reloadDataFromBackend: function (opts) {
      var oODataModel = opts.oModel;
      var aFilters = opts.filters;
      var aFiltersVB = opts.filtersVendorBatch || aFilters;  // ← NoMatList fix: filtri separati per VendorBatchSet
      var sVendor10 = opts.vendor10;
      var oVmCache = opts.oVmCache;
      var bMockS3 = opts.mockS3;
      var sForceStato = opts.forceStato;
      var fnDone = opts.onDone;

      function done(a) { if (typeof fnDone === "function") fnDone(a || []); }

      // MOCK
      if (bMockS3) {
        BusyIndicator.show(0);

        MockData.loadDataSetGeneric().then(function (aAll) {
          BusyIndicator.hide();

          var a = Array.isArray(aAll) ? aAll : [];
          if (sForceStato === "ST" || sForceStato === "AP" || sForceStato === "RJ" || sForceStato === "CH") {
            a.forEach(function (r) { if (r) r.Stato = sForceStato; });
          }

          done(a);
        }).catch(function (e) {
          BusyIndicator.hide();
          console.error("[DataLoader] MOCK loadDataSetGeneric ERROR", e);
          MessageToast.show("MOCK DataSet.json NON CARICATO");
          done([]);
        });

        return;
      }

      // REAL
      BusyIndicator.show(0);

      var pDataSet = new Promise(function (resolve, reject) {
        oODataModel.read("/DataSet", {
          filters: aFilters,
          urlParameters: { "sap-language": "IT" },
          success: function (oData) {
            resolve((oData && oData.results) || []);
          },
          error: reject
        });
      });

      var pVendorBatch = new Promise(function (resolve, reject) {
        oODataModel.read("/VendorBatchSet", {
          filters: aFiltersVB,                              
          urlParameters: { "$format": "json", "sap-language": "IT" },

          success: function (oData) {
            var results = (oData && oData.results) || [];

            var exclude = ["Fornitore", "Materiale", "Stagione", "__metadata", "UserID"];
            var finalObject = results.reduce(function (acc, item) {
              Object.keys(item).forEach(function (key) {
                if (!exclude.includes(key)) {
                  if (!acc[key]) acc[key] = [];
                  acc[key].push(item[key]);
                }
              });
              return acc;
            }, {});

            function normStr(v) { return String(v == null ? "" : v).trim(); }
            function uniqCaseInsensitive(arr) {
              var seen = {};
              var out = [];
              (arr || []).forEach(function (v) {
                var s = normStr(v);
                if (!s) return;
                var k = s.toUpperCase();
                if (seen[k]) return;
                seen[k] = true;
                out.push(s);
              });
              return out;
            }

            var suggestionsByField = {};
            Object.keys(finalObject || {}).forEach(function (field) {
              var a = uniqCaseInsensitive(finalObject[field]);
              suggestionsByField[field] = a.map(function (v) { return { key: v }; });
            });

            oVmCache.setProperty("/suggestionsByField", suggestionsByField);
            oVmCache.setProperty("/cache/vendorBatchFinalObjectByVendor/" + sVendor10, finalObject);

            resolve(results);
          },

          error: reject
        });
      });

      Promise.all([pDataSet, pVendorBatch])
        .then(function (res) {
          BusyIndicator.hide();

          var aDataSetRows = res[0];
          var aVendorBatches = res[1];

          if (sForceStato === "ST" || sForceStato === "AP" || sForceStato === "RJ" || sForceStato === "CH") {
            aDataSetRows.forEach(function (r) { if (r) r.Stato = sForceStato; });
          }

          done(aDataSetRows);

          oVmCache.setProperty(
            "/cache/vendorBatchByVendor/" + sVendor10,
            aVendorBatches
          );

        })
        .catch(function (oError) {
          BusyIndicator.hide();
          console.error("Errore lettura DataSet o VendorBatchSet", oError);
          MessageToast.show("Errore nel caricamento dei dati");
          done([]);
        });
    },

    /**
     * Idrata la configurazione MMCT dalle righe
     */
    hydrateMmctFromRows: function (aRows, oDetail, oVm, getCodAgg) {
      var r0 = (Array.isArray(aRows) && aRows.length)
        ? ((aRows.find(function (r) { return getCodAgg(r) !== "N"; })) || (aRows[0] || {}))
        : {};
      var sCat = String(r0.CatMateriale || "").trim();

      var a00All = sCat ? MmctUtil.cfgForScreen(oVm, sCat, "00") : [];
      var aHdr3 = (a00All || [])
        .filter(function (f) { return !!(f && f.testata1); })
        .filter(function (f) { return String(f.ui || "").trim().toUpperCase() !== "FORNITORE"; });

      var a01All = sCat ? MmctUtil.cfgForScreen(oVm, sCat, "01") : [];
      var a01Table = (a01All || [])
        .filter(function (f) { return !(f && f.testata1); });

      var a02All = sCat ? MmctUtil.cfgForScreen(oVm, sCat, "02") : [];

      // Determine if this category has detail level (Screen4).
      // Priority: backend "Dettaglio" field on the MMCT category record,
      // fallback: true if there are any S02 fields configured.
      var bHasDetail = false;
      try {
        var aMMCT = (oVm && oVm.getProperty("/userMMCT")) || [];
        var oCatRec = aMMCT.find(function (c) {
          return String(c.CatMateriale || "").trim().toUpperCase() === sCat.toUpperCase();
        });
        if (oCatRec && oCatRec.Dettaglio !== undefined) {
          bHasDetail = String(oCatRec.Dettaglio || "").trim().toUpperCase() === "X";
        } else {
          // Fallback: if there are S02 fields, there is a detail level
          bHasDetail = a02All.length > 0;
        }
      } catch (e) {
        bHasDetail = a02All.length > 0;
      }

      oDetail.setProperty("/_mmct", {
        cat: sCat,
        raw0: r0,
        hasDetail: bHasDetail,

        s00: a00All,
        hdr3: aHdr3,

        s01: a01All,
        s01Table: a01Table,

        s02: a02All
      });

      return {
        cat: sCat,
        s00All: a00All.length,
        hdr3: aHdr3.length,
        s01All: a01All.length,
        s01Table: a01Table.length,
        s02All: a02All.length
      };
    }

  };
});