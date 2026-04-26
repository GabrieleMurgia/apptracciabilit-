sap.ui.define([
  "sap/m/MessageBox",
  "apptracciabilita/apptracciabilita/util/normalize",
  "apptracciabilita/apptracciabilita/util/vmModelPaths",
  "apptracciabilita/apptracciabilita/util/recordsUtil",
  "apptracciabilita/apptracciabilita/util/postUtil",
  "apptracciabilita/apptracciabilita/util/saveUtil",
  "apptracciabilita/apptracciabilita/util/rowErrorUtil"
], function (MessageBox, N, VmPaths, RecordsUtil, PostUtil, SaveUtil, RowErrorUtil) {
  "use strict";

  function buildValidationMessage(vr) {
    var top = vr.errors.slice(0, 15).map(function (e) {
      return "- [" + e.page + "] " + e.label + " (Riga: " + (e.row || "?") + ")";
    }).join("\n");

    return "Compila tutti i campi obbligatori prima di salvare.\n\n" + top +
      (vr.errors.length > 15 ? "\n\n... altri " + (vr.errors.length - 15) + " errori" : "");
  }

  return {
    clearPostErrorByContext: function (opts) {
      RowErrorUtil.clearPostErrorByContext(opts.context, {
        oDetail: opts.detailModel,
        updateRowStyles: opts.updateRowStylesFn
      });
    },

    markRowsWithPostErrors: function (opts) {
      RowErrorUtil.markRowsWithPostErrors(opts.responseLines, {
        oDetail: opts.detailModel,
        toStableString: N.toStableString,
        applyClientFilters: opts.applyClientFiltersFn,
        ensurePostErrorRowHooks: opts.ensurePostErrorRowHooksFn
      });
    },

    invalidateScreen3Cache: function (opts) {
      opts.vmModel.setProperty(VmPaths.dataRowsByKeyPath(opts.cacheKey), []);
      opts.vmModel.setProperty(VmPaths.recordsByKeyPath(opts.cacheKey), []);
    },

    refreshAfterPost: function (opts) {
      return new Promise(function (resolve) {
        opts.reloadDataFromBackendFn(function (aResults) {
          opts.hydrateAndFormatFn(aResults);

          var oDetail = opts.detailModel;
          var res = RecordsUtil.computeOpenOdaFromRows(aResults);
          if (res.hasSignalProp) oDetail.setProperty("/OpenOda", res.flag);

          var aRecordsBuilt = RecordsUtil.buildRecords01(aResults, {
            oDetail: oDetail,
            oVm: opts.vmModel,
            includeTemplates: !!opts.noMatListMode
          });
          opts.vmModel.setProperty(VmPaths.dataRowsByKeyPath(opts.cacheKey), aResults);
          opts.vmModel.setProperty(VmPaths.recordsByKeyPath(opts.cacheKey), aRecordsBuilt);

          Promise.resolve(opts.bindRecordsFn(aRecordsBuilt)).then(function () {
            opts.setSnapshotRecordsFn(N.deepClone(aRecordsBuilt));
            opts.clearSelectionFn();
            resolve(aResults);
          });
        });
      });
    },

    onSave: function (opts) {
      var vr = SaveUtil.validateRequiredBeforePost({
        oDetail: opts.detailModel,
        oVm: opts.vmModel,
        getCacheKeySafe: opts.getCacheKeySafeFn,
        getExportCacheKey: opts.getExportCacheKeyFn,
        toStableString: N.toStableString,
        rowGuidKey: RecordsUtil.rowGuidKey,
        getCodAgg: N.getCodAgg
      });
      if (!vr.ok) return MessageBox.error(buildValidationMessage(vr));

      var mock = (opts.vmModel && opts.vmModel.getProperty("/mock")) || {};
      var oDetail = opts.detailModel;
      var oPayload = SaveUtil.buildSavePayload({
        oDetail: oDetail,
        oVm: opts.vmModel,
        userId: (opts.vmModel && opts.vmModel.getProperty("/userId")) || "",
        vendor10: N.normalizeVendor10(opts.vendorId),
        material: String(opts.material || "").trim(),
        getExportCacheKey: opts.getExportCacheKeyFn,
        toStableString: N.toStableString,
        getCodAgg: N.getCodAgg,
        getMultiFieldsMap: function () { return PostUtil.getMultiFieldsMap(oDetail); },
        normalizeMultiString: N.normalizeMultiString,
        uuidv4: N.uuidv4
      });

      var self = this;
      SaveUtil.executePost({
        oModel: opts.odataModel,
        payload: oPayload,
        mock: !!mock.mockS3,
        onSuccess: function () {
          oDetail.setProperty("/__deletedLinesForPost", []);
          self.invalidateScreen3Cache({
            vmModel: opts.vmModel,
            cacheKey: opts.cacheKey
          });
          self.refreshAfterPost({
            reloadDataFromBackendFn: opts.reloadDataFromBackendFn,
            hydrateAndFormatFn: opts.hydrateAndFormatFn,
            detailModel: oDetail,
            vmModel: opts.vmModel,
            cacheKey: opts.cacheKey,
            noMatListMode: opts.noMatListMode,
            bindRecordsFn: opts.bindRecordsFn,
            setSnapshotRecordsFn: opts.setSnapshotRecordsFn,
            clearSelectionFn: opts.clearSelectionFn
          });
        },
        onPartialError: function (aErr) {
          self.markRowsWithPostErrors({
            responseLines: aErr,
            detailModel: opts.detailModel,
            applyClientFiltersFn: opts.applyClientFiltersFn,
            ensurePostErrorRowHooksFn: opts.ensurePostErrorRowHooksFn
          });
          PostUtil.showPostErrorMessagePage(aErr);
        },
        onFullError: function () {}
      });
    }
  };
});
