sap.ui.define([
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "apptracciabilita/apptracciabilita/util/normalize",
  "apptracciabilita/apptracciabilita/util/recordsUtil",
  "apptracciabilita/apptracciabilita/util/postUtil",
  "apptracciabilita/apptracciabilita/util/saveUtil",
  "apptracciabilita/apptracciabilita/util/screen4LoaderUtil"
], function (JSONModel, MessageToast, MessageBox, N, RecordsUtil, PostUtil, SaveUtil, S4Loader) {
  "use strict";

  function buildValidationMessage(vr) {
    var top = vr.errors.slice(0, 15).map(function (e) {
      return "- [" + e.page + "] " + e.label + " (Riga: " + (e.row || "?") + ")";
    }).join("\n");

    return "Compila tutti i campi obbligatori prima di salvare.\n\n" + top +
      (vr.errors.length > 15 ? "\n\n... altri " + (vr.errors.length - 15) + " errori" : "");
  }

  return {
    onSaveLocal: function (opts) {
      try {
        var oD = opts.detailModel;
        if (!oD) return;
        if (!oD.getProperty("/__dirty")) { MessageToast.show("Nessuna modifica da salvare"); return; }
        if (!RecordsUtil.validatePercBeforeSave(oD, "/RowsAll")) return;

        var aRows = oD.getProperty("/RowsAll") || [];
        var oVm = opts.vmModel;
        var sCK = opts.cacheKey;
        var sGuid = N.toStableString(oD.getProperty("/guidKey"));
        var sFibra = N.toStableString(oD.getProperty("/Fibra"));
        var aC = (oVm.getProperty("/cache/dataRowsByKey/" + sCK) || []).filter(function (r) {
          return S4Loader.rowGuidKey(r) !== sGuid;
        });

        oVm.setProperty("/cache/dataRowsByKey/" + sCK, aC.concat(aRows));
        opts.updateVmRecordStatusFn(
          sCK,
          sGuid,
          sFibra,
          String(oD.getProperty("/__role") || "").trim().toUpperCase(),
          String(oD.getProperty("/__status") || "ST").trim().toUpperCase()
        );
        opts.setSnapshotRowsFn(N.deepClone(aRows));
        oD.setProperty("/__dirty", false);
        opts.applyUiPermissionsFn();
        MessageToast.show("Salvato (locale/cache)");
      } catch (e) {
        console.error("[S4] onSaveLocal ERROR", e);
        MessageToast.show("Errore salvataggio");
      }
    },

    assignStableGuidBeforeSave: function (opts) {
      function isLocalGuid(g) {
        var s = String(g || "");
        return !s || s.indexOf("NEW_") >= 0 || s.indexOf("SYNTH_") >= 0 || s.indexOf("-new") >= 0;
      }

      var oD = opts.detailModel;
      var oVm = opts.vmModel;
      var sCK = opts.cacheKey;
      var sOldGuid = N.toStableString(oD.getProperty("/guidKey"));
      var sStableGuid = isLocalGuid(sOldGuid) ? N.uuidv4() : sOldGuid;

      function rewriteGuid(row) {
        if (!row) return;
        var g = N.toStableString(row.guidKey || row.Guid || row.GUID || "");
        if (g !== sOldGuid) return;
        row.Guid = sStableGuid;
        row.GUID = sStableGuid;
        row.guidKey = sStableGuid;
      }

      oD.setProperty("/guidKey", sStableGuid);

      var aRecordsCache = oVm.getProperty("/cache/recordsByKey/" + sCK) || [];
      aRecordsCache.forEach(rewriteGuid);
      oVm.setProperty("/cache/recordsByKey/" + sCK, aRecordsCache);

      var aDetailRowsCache = oVm.getProperty("/cache/dataRowsByKey/" + sCK) || [];
      aDetailRowsCache.forEach(rewriteGuid);
      oVm.setProperty("/cache/dataRowsByKey/" + sCK, aDetailRowsCache);

      var aCurrentRows = oD.getProperty("/RowsAll") || [];
      aCurrentRows.forEach(rewriteGuid);
      oD.setProperty("/RowsAll", aCurrentRows);

      return aRecordsCache;
    },

    buildSavePayload: function (opts) {
      var oD = opts.detailModel;
      var oVm = opts.vmModel;
      var sCK = opts.cacheKey;
      var aRecordsAll = opts.recordsAll;
      var sCat = String(oD.getProperty("/_mmct/cat") || "").trim();
      var aS00 = sCat ? opts.cfgForScreenFn(sCat, "00") : [];
      var aS01 = sCat ? opts.cfgForScreenFn(sCat, "01") : [];
      var aS02 = sCat ? opts.cfgForScreenFn(sCat, "02") : [];

      var oProxyDetail = new JSONModel({
        RecordsAll: aRecordsAll,
        _mmct: { s00: aS00, s01: aS01, s02: aS02 },
        __deletedLinesForPost: oVm.getProperty("/cache/__deletedLinesForPost_" + sCK) || []
      });

      var vr = SaveUtil.validateRequiredBeforePost({
        oDetail: oProxyDetail,
        oVm: oVm,
        getCacheKeySafe: opts.getCacheKeySafeFn,
        getExportCacheKey: opts.getDataCacheKeyFn,
        toStableString: N.toStableString,
        rowGuidKey: RecordsUtil.rowGuidKey,
        getCodAgg: N.getCodAgg,
        fromScreen: "S4"
      });
      if (!vr.ok) {
        MessageBox.error(buildValidationMessage(vr));
        oProxyDetail.destroy();
        return null;
      }

      return {
        proxy: oProxyDetail,
        payload: SaveUtil.buildSavePayload({
          oDetail: oProxyDetail,
          oVm: oVm,
          userId: (oVm && oVm.getProperty("/userId")) || "",
          vendor10: N.normalizeVendor10(opts.vendorId),
          material: String(opts.material || "").trim(),
          getExportCacheKey: opts.getDataCacheKeyFn,
          toStableString: N.toStableString,
          getCodAgg: N.getCodAgg,
          getMultiFieldsMap: function () { return PostUtil.getMultiFieldsMap(oProxyDetail); },
          normalizeMultiString: N.normalizeMultiString,
          uuidv4: N.uuidv4
        })
      };
    },

    executePostAndReload: function (opts) {
      var oVm = opts.vmModel;
      var sCK = opts.cacheKey;
      var mock = (oVm && oVm.getProperty("/mock")) || {};
      var self = this;

      SaveUtil.executePost({
        oModel: opts.odataModel,
        payload: opts.payload,
        mock: !!mock.mockS4,
        onSuccess: function () {
          opts.proxyDetail.destroy();
          oVm.setProperty("/cache/__deletedLinesForPost_" + sCK, []);
          self.reloadAfterSaveAndNavBack(opts);
        },
        onPartialError: function (aErr) {
          opts.proxyDetail.destroy();
          PostUtil.showPostErrorMessagePage(aErr);
        },
        onFullError: function (oError) {
          opts.proxyDetail.destroy();
          MessageBox.error(N.getBackendErrorMessage(oError));
        }
      });
    },

    reloadAfterSaveAndNavBack: function (opts) {
      var oVm = opts.vmModel;
      var sCK = opts.cacheKey;
      var oD = opts.detailModel;

      S4Loader.reloadDataFromBackend({
        oVm: oVm,
        oDataModel: opts.odataModel,
        vendorId: opts.vendorId,
        material: opts.material,
        catMateriale: (oVm && oVm.getProperty("/__noMatListCat")) || "",
        season: (oVm && oVm.getProperty("/__currentSeason")) || "",
        logFn: opts.logFn
      }, function (aFreshRows) {
        aFreshRows = aFreshRows || [];

        var sCat2 = S4Loader.pickCat(aFreshRows[0] || {});
        var aFreshRecords = S4Loader.buildRecords01ForCache(
          aFreshRows,
          sCat2 ? opts.cfgForScreenFn(sCat2, "01") : [],
          oVm
        );

        oVm.setProperty("/cache/dataRowsByKey/" + sCK, aFreshRows);
        oVm.setProperty("/cache/recordsByKey/" + sCK, aFreshRecords);
        oVm.setProperty("/selectedScreen3Record", null);
        oVm.setProperty("/__skipS3BackendOnce", true);
        oVm.setProperty("/__forceS3CacheReload", true);

        opts.stopAttachmentPollingFn();
        oD.setProperty("/__dirty", false);
        MessageToast.show("Dati salvati con successo");

        opts.router.navTo("Screen3", {
          vendorId: encodeURIComponent(opts.vendorId),
          material: encodeURIComponent(opts.material),
          mode: opts.mode || "A"
        }, true);
      });
    },

    onSaveToBackend: function (opts) {
      var oD = opts.detailModel;
      if (!oD) return;

      if (oD.getProperty("/__dirty")) {
        this.onSaveLocal(opts);
      }
      if (!RecordsUtil.validatePercBeforeSave(oD, "/RowsAll")) return;

      var oVm = opts.vmModel;
      var sCK = opts.cacheKey;
      var aRecordsAll = oVm.getProperty("/cache/recordsByKey/" + sCK) || [];
      if (!aRecordsAll.length) {
        MessageBox.warning("Nessun record trovato. Tornare alla schermata precedente e riprovare.");
        return;
      }

      aRecordsAll = this.assignStableGuidBeforeSave(opts);

      var oBuild = this.buildSavePayload({
        detailModel: oD,
        vmModel: oVm,
        cacheKey: sCK,
        recordsAll: aRecordsAll,
        cfgForScreenFn: opts.cfgForScreenFn,
        getCacheKeySafeFn: opts.getCacheKeySafeFn,
        getDataCacheKeyFn: opts.getDataCacheKeyFn,
        vendorId: opts.vendorId,
        material: opts.material
      });
      if (!oBuild) return;

      opts.logFn("onSaveToBackend payload", {
        lines: oBuild.payload.PostDataCollection ? oBuild.payload.PostDataCollection.length : 0
      });

      this.executePostAndReload({
        detailModel: oD,
        vmModel: oVm,
        cacheKey: sCK,
        proxyDetail: oBuild.proxy,
        payload: oBuild.payload,
        odataModel: opts.odataModel,
        vendorId: opts.vendorId,
        material: opts.material,
        mode: opts.mode,
        router: opts.router,
        cfgForScreenFn: opts.cfgForScreenFn,
        logFn: opts.logFn,
        stopAttachmentPollingFn: opts.stopAttachmentPollingFn
      });
    }
  };
});
