sap.ui.define([
  "sap/ui/core/BusyIndicator",
  "sap/m/MessageToast",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "apptracciabilita/apptracciabilita/util/mockData",
  "apptracciabilita/apptracciabilita/util/postUtil",
  "apptracciabilita/apptracciabilita/util/mmctUtil"
], function (BusyIndicator, MessageToast, Filter, FilterOperator, MockData, PostUtil, MmctUtil) {
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

      var sVendor10 = String(sVendorId || "").trim();
      if (/^\d+$/.test(sVendor10) && sVendor10.length < 10) {
        sVendor10 = ("0000000000" + sVendor10).slice(-10);
      }

      function norm(v) { return String(v || "").trim().toUpperCase(); }
      var sRouteMat = norm(sMaterial);

      var set = {};
      function add(x) { x = norm(x); if (x) set[x] = true; }
      add(sRouteMat);
      if (sRouteMat && sRouteMat.slice(-1) !== "S") add(sRouteMat + "S");
      if (sRouteMat && sRouteMat.slice(-1) === "S") add(sRouteMat.slice(0, -1));
      var aMatVariants = Object.keys(set);

      var aFilters = [
        new Filter("UserID", FilterOperator.EQ, sUserId),
        new Filter("Fornitore", FilterOperator.EQ, sVendor10)
      ];

      if (sSeason) {
        aFilters.push(new Filter("Stagione", FilterOperator.EQ, sSeason));
      }

      if (aMatVariants.length) {
        var aMatFilters = aMatVariants.map(function (m) {
          return new Filter("Materiale", FilterOperator.EQ, m);
        });
        aFilters.push(new Filter(aMatFilters, false));
      }

      return aFilters;
    },

    /**
     * Carica i dati dal backend (DataSet + VendorBatchSet)
     */
    reloadDataFromBackend: function (opts) {
      var oODataModel = opts.oModel;
      var aFilters = opts.filters;
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
            console.log("[MOCK] forceStato =", sForceStato);
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
          filters: aFilters,
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

          console.log(
            "[DataLoader] VendorBatchSet cached",
            sVendor10,
            aVendorBatches.length
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

      oDetail.setProperty("/_mmct", {
        cat: sCat,
        raw0: r0,

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

    // NOTE: _loadDataOnce, _reloadDataFromBackend, _refreshAfterPost were removed.
    // They used `this` (controller context) and belong in the controller, not in a util module.
    // They are already correctly implemented in Screen3_controller.js.

  };
});