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
      var sCatMateriale = opts.catMateriale || "";  // ← NoMatList: filtro per categoria

      var sVendor10 = String(sVendorId || "").trim();
      if (/^\d+$/.test(sVendor10) && sVendor10.length < 10) {
        sVendor10 = ("0000000000" + sVendor10).slice(-10);
      }

      var aFilters = [
        new Filter("UserID", FilterOperator.EQ, sUserId),
        new Filter("Fornitore", FilterOperator.EQ, sVendor10)
      ];

      // ── NoMatList: filtro per categoria materiale, senza materiale/stagione ──
      if (sCatMateriale) {
        aFilters.push(new Filter("CatMateriale", FilterOperator.EQ, sCatMateriale));
        // Non aggiungere filtri Materiale né Stagione
        return aFilters;
      }

      // ── Flusso normale: filtro per materiale + stagione ──
      function norm(v) { return String(v || "").trim().toUpperCase(); }
      var sRouteMat = norm(sMaterial);

      var set = {};
      function add(x) { x = norm(x); if (x) set[x] = true; }
      add(sRouteMat);
      if (sRouteMat && sRouteMat.slice(-1) !== "S") add(sRouteMat + "S");
      if (sRouteMat && sRouteMat.slice(-1) === "S") add(sRouteMat.slice(0, -1));
      var aMatVariants = Object.keys(set);

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
            debugger
            resolve((oData && oData.results) || []);
          },
          error: reject
        });
      });

      var pVendorBatch = new Promise(function (resolve, reject) {
        oODataModel.read("/VendorBatchSet", {
          filters: aFiltersVB,                               // ← NoMatList fix: usa filtri senza CatMateriale
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

      _loadDataOnce: function () {
      var oVm = this._getOVm();
      var sBaseKey = this._getCacheKeySafe();

      var bMockS3 = this._isMockS3Enabled();
      var sKey = (bMockS3 ? "MOCK|" : "REAL|") + sBaseKey;

      var aRows = oVm.getProperty("/cache/dataRowsByKey/" + sKey) || null;
      var aRecs = oVm.getProperty("/cache/recordsByKey/" + sKey) || null;

      var bSkipBackendOnce = !!oVm.getProperty("/__skipS3BackendOnce");
      if (bSkipBackendOnce) {
        oVm.setProperty("/__skipS3BackendOnce", false);
      }

      var bHasCache = Array.isArray(aRows) && aRows.length && Array.isArray(aRecs) && aRecs.length;

      if (bHasCache) {
        try {
          this._hydrateMmctFromRows(aRows);
          this._formatIncomingRowsMultiSeparators(aRows);
          oVm.setProperty("/cache/dataRowsByKey/" + sKey, aRows);

          var mTplGuid = {};
          (aRows || []).forEach(function (r) {
            if (this._getCodAgg(r) === "N") mTplGuid[this._rowGuidKey(r)] = true;
          }.bind(this));

          aRecs = (aRecs || []).filter(function (rec) {
            var g = this._toStableString(rec && (rec.guidKey || rec.GUID || rec.Guid));
            return !mTplGuid[g];
          }.bind(this));
          oVm.setProperty("/cache/recordsByKey/" + sKey, aRecs);

          var oDetailC = this._getODetail();
          var resC = this._computeOpenOdaFromRows(aRows);
          if (resC.hasSignalProp) oDetailC.setProperty("/OpenOda", resC.flag);

          this._bindRecords(aRecs);
        } catch (e) {
          console.warn("[S3] cache bind failed", e);
        }
      }

      if (bSkipBackendOnce && bHasCache) {
        this._log("_loadDataOnce: skip backend reload (back from Screen4)", { cacheKey: sKey });
        return;
      }

      this._loadToken = (this._loadToken || 0) + 1;
      var iToken = this._loadToken;

      this._reloadDataFromBackend(function (aResults) {
        if (iToken !== this._loadToken) return;

        this._hydrateMmctFromRows(aResults);
        this._formatIncomingRowsMultiSeparators(aResults);

        var oDetail = this._getODetail();
        var res = this._computeOpenOdaFromRows(aResults);
        if (res.hasSignalProp) oDetail.setProperty("/OpenOda", res.flag);

        var aRecordsBuilt = this._buildRecords01(aResults);

        oVm.setProperty("/cache/dataRowsByKey/" + sKey, aResults);
        oVm.setProperty("/cache/recordsByKey/" + sKey, aRecordsBuilt);

        this._bindRecords(aRecordsBuilt);
      }.bind(this));
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
    },

    _reloadDataFromBackend: function (fnDone) {
      var oVm = this.getOwnerComponent().getModel("vm");
      var mock = (oVm && oVm.getProperty("/mock")) || {};
      var sForceStato = String(mock.forceStato || "").trim().toUpperCase();
      var bMockS3 = !!mock.mockS3;

      var sUserId = (oVm && oVm.getProperty("/userId")) || "E_ZEMAF";

      var sVendor10 = String(this._sVendorId || "").trim();
      if (/^\d+$/.test(sVendor10) && sVendor10.length < 10) {
        sVendor10 = ("0000000000" + sVendor10).slice(-10);
      }

      var aFilters = DataLoaderUtil.buildCommonFilters({
        userId: sUserId,
        vendorId: this._sVendorId,
        material: this._sMaterial,
        season: this._sSeason
      });

      DataLoaderUtil.reloadDataFromBackend({
        oModel: this.getOwnerComponent().getModel(),
        filters: aFilters,
        vendor10: sVendor10,
        oVmCache: this._getOVm(),
        mockS3: bMockS3,
        forceStato: sForceStato,
        onDone: fnDone
      });
    },

    _refreshAfterPost: function (oPostData) {
      console.log("[S3] POST RESULT (oData):", JSON.parse(JSON.stringify(oPostData || {})));

      return new Promise(function (resolve) {
        this._reloadDataFromBackend(function (aResults) {
          this._hydrateMmctFromRows(aResults);
          this._formatIncomingRowsMultiSeparators(aResults);

          var oDetail = this._getODetail();
          var res = this._computeOpenOdaFromRows(aResults);
          if (res.hasSignalProp) oDetail.setProperty("/OpenOda", res.flag);

          var aRecordsBuilt = this._buildRecords01(aResults);

          var oVm = this._getOVm();
          var sKey = this._getExportCacheKey();
          oVm.setProperty("/cache/dataRowsByKey/" + sKey, aResults);
          oVm.setProperty("/cache/recordsByKey/" + sKey, aRecordsBuilt);

          Promise.resolve(this._bindRecords(aRecordsBuilt)).then(function () {
            this._snapshotRecords = deepClone(aRecordsBuilt);

            console.log("[S3] REFRESH DONE (rows from backend):", aResults.length);
            resolve(aResults);
          }.bind(this));
        }.bind(this));
      }.bind(this));
    },

  };
});