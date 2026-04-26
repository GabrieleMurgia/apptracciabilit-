sap.ui.define([
  "sap/m/MessageToast",
  "apptracciabilita/apptracciabilita/util/normalize",
  "apptracciabilita/apptracciabilita/util/vmModelPaths",
  "apptracciabilita/apptracciabilita/util/recordsUtil",
  "apptracciabilita/apptracciabilita/util/rowManagementUtil",
  "apptracciabilita/apptracciabilita/util/postUtil",
  "apptracciabilita/apptracciabilita/util/screen4CacheUtil",
  "apptracciabilita/apptracciabilita/util/touchCodAggUtil",
  "apptracciabilita/apptracciabilita/util/mdcTableUtil",
  "apptracciabilita/apptracciabilita/util/i18nUtil"
], function (MessageToast, N, VmPaths, RecordsUtil, RowManagementUtil, PostUtil, Screen4CacheUtil, TouchCodAggUtil, MdcTableUtil, I18n) {
  "use strict";

  function vMatch(v1, v2) {
    if (Array.isArray(v1) && Array.isArray(v2)) return JSON.stringify(v1) === JSON.stringify(v2);
    return String(v1 == null ? "" : v1) === String(v2 == null ? "" : v2);
  }

  function checkParentDirtyRevert(opts) {
    var p = opts.parent;
    var sPath = opts.path;
    var snap = opts.snapshotRecords;
    if (!snap || !p || p.__isNew) return;

    var oDetail = opts.detailModel;
    var aKeys = (oDetail.getProperty("/_mmct/s01") || []).map(function (f) { return f && f.ui; }).filter(Boolean);
    if (!aKeys.length) return;

    var iIdx = (p.idx != null) ? parseInt(p.idx, 10) : NaN;
    if (isNaN(iIdx)) return;
    var snapRow = null;
    snap.forEach(function (s) { if (!snapRow && parseInt(s.idx, 10) === iIdx) snapRow = s; });
    if (!snapRow) return;

    if (!aKeys.every(function (k) { return vMatch(p[k], snapRow[k]); })) return;

    var sOrigCa = snapRow.CodAgg || "";
    p.CodAgg = sOrigCa;
    if (sPath) oDetail.setProperty(sPath + "/CodAgg", sOrigCa);

    var aAll = oDetail.getProperty("/RecordsAll") || [];
    for (var i = 0; i < aAll.length; i++) {
      if (parseInt(aAll[i] && aAll[i].idx, 10) === iIdx) {
        oDetail.setProperty("/RecordsAll/" + i + "/CodAgg", sOrigCa);
        break;
      }
    }

    var g = N.toStableString(N.getGuid(p));
    if (g) {
      var aRaw = opts.vmModel.getProperty(VmPaths.dataRowsByKeyPath(opts.cacheKey)) || [];
      aRaw.forEach(function (r) { if (N.rowGuidKey(r) === g) r.CodAgg = sOrigCa; });
      opts.vmModel.setProperty(VmPaths.dataRowsByKeyPath(opts.cacheKey), aRaw);
    }

    if (Array.isArray(opts.originalSnapshot)) {
      for (var j = 0; j < opts.originalSnapshot.length; j++) {
        if (parseInt(opts.originalSnapshot[j] && opts.originalSnapshot[j].idx, 10) === iIdx) {
          opts.originalSnapshot[j] = N.deepClone(p);
          break;
        }
      }
    }
  }

  return {
    touchCodAggParent: function (opts) {
      TouchCodAggUtil.touchCodAggParent(opts.parent, opts.path, {
        oDetail: opts.detailModel,
        oVm: opts.vmModel,
        cacheKey: opts.cacheKey
      });
      checkParentDirtyRevert(opts);
    },

    checkParentDirtyRevert: checkParentDirtyRevert,

    onGoToScreen4FromRow: function (opts) {
      try {
        var oBtn = opts.event.getSource();
        var oCtx = oBtn && oBtn.getBindingContext && (oBtn.getBindingContext("detail") || oBtn.getBindingContext());
        if (!oCtx) return;
        var oRow = oCtx.getObject && oCtx.getObject();
        var iIdx = (oRow && oRow.idx != null) ? parseInt(oRow.idx, 10) : NaN;
        if (isNaN(iIdx) && oCtx.getPath) {
          var mm = String(oCtx.getPath() || "").match(/\/(\d+)\s*$/);
          if (mm) iIdx = parseInt(mm[1], 10);
        }
        if (isNaN(iIdx) || iIdx < 0) iIdx = 0;

        var aCurrent = opts.detailModel.getProperty("/RecordsAll") || [];
        if (aCurrent.length) {
          opts.setSnapshotRecordsFn(N.deepClone(aCurrent));
        }

        Screen4CacheUtil.setSelectedParentForScreen4(oRow, opts.vmModel, opts.component);
        Screen4CacheUtil.ensureScreen4CacheForParentIdx(iIdx, N.toStableString(oRow.guidKey || oRow.GUID || oRow.Guid), opts.vmModel, opts.cacheKeySafe);

        opts.router.navTo("Screen4", {
          vendorId: encodeURIComponent(opts.vendorId),
          material: encodeURIComponent(opts.material),
          recordKey: encodeURIComponent(String(iIdx)),
          mode: opts.mode || "A"
        });
      } catch (e) {
        console.error("onGoToScreen4FromRow ERROR", e);
      }
    },

    onAddRow: function (opts) {
      var oDetail = opts.detailModel;
      if (!oDetail) return MessageToast.show(I18n.text(null, "msg.detailModelNotFound", [], "Model 'detail' non trovato"));
      if (!oDetail.getProperty("/__canAddRow")) return MessageToast.show(I18n.text(null, "msg.noPermissionAddRows", [], "Non hai permessi per aggiungere righe"));

      var oVm = opts.vmModel;
      var sCacheKey = opts.cacheKey;
      var guidTpl = RowManagementUtil.pickTemplateGuidForNewParent({
        selectedObjects: [],
        oVm: oVm,
        cacheKey: sCacheKey,
        toStableString: N.toStableString,
        rowGuidKey: RecordsUtil.rowGuidKey,
        getCodAgg: N.getCodAgg
      });
      var aTplRows = RowManagementUtil.getTemplateRowsByGuid(guidTpl, {
        oVm: oVm,
        cacheKey: sCacheKey,
        rowGuidKey: RecordsUtil.rowGuidKey,
        isBaseCodAgg: N.isBaseCodAgg
      });

      if (!aTplRows || !aTplRows.length) {
        MessageToast.show(I18n.text(null, "msg.templateRowMissingForAdd", [], "Template mancante: non esiste una riga con CodAgg = \"N\" da usare come modello"));
        return;
      }

      var result = RowManagementUtil.createNewParentRow({
        oDetail: oDetail,
        template: aTplRows[0] || {},
        cfg01: oDetail.getProperty("/_mmct/s01") || [],
        vendorId: opts.vendorId,
        material: opts.material,
        normalizeVendor10: N.normalizeVendor10,
        toArrayMulti: RecordsUtil.toArrayMulti,
        statusText: RecordsUtil.statusText,
        genGuidNew: N.genGuidNew
      });

      var aNewDetails = RowManagementUtil.createNewDetailRows(aTplRows, {
        template: aTplRows[0] || {},
        cfg02: oDetail.getProperty("/_mmct/s02") || [],
        cfgStruct: oDetail.getProperty("/_mmct/s00") || [],
        guid: result.guid,
        vendorId: opts.vendorId,
        material: opts.material,
        cat: oDetail.getProperty("/_mmct/cat") || "",
        normalizeVendor10: N.normalizeVendor10,
        toArrayMulti: RecordsUtil.toArrayMulti
      });

      var aAll = (oDetail.getProperty("/RecordsAll") || []).slice();
      aAll.push(result.row);
      oDetail.setProperty("/RecordsAll", aAll);

      var aRC = (oVm.getProperty(VmPaths.recordsByKeyPath(sCacheKey)) || []).slice();
      aRC.push(result.row);
      oVm.setProperty(VmPaths.recordsByKeyPath(sCacheKey), aRC);

      var aRW = (oVm.getProperty(VmPaths.dataRowsByKeyPath(sCacheKey)) || []).slice();
      oVm.setProperty(VmPaths.dataRowsByKeyPath(sCacheKey), aRW.concat(aNewDetails));

      Screen4CacheUtil.setSelectedParentForScreen4(result.row, oVm, opts.component);
      Screen4CacheUtil.ensureScreen4CacheForParentIdx(result.idx, result.guid, oVm, opts.cacheKeySafe);
      opts.applyClientFiltersFn();

      var aFiltered = oDetail.getProperty("/Records") || [];
      var iNewRowIndex = aFiltered.length - 1;
      if (iNewRowIndex >= 0) {
        MdcTableUtil.scrollToRow(opts.table, iNewRowIndex);
      }

      MessageToast.show(I18n.text(null, "msg.rowAdded", [], "Riga aggiunta"));
    },

    onCopyRow: function (opts) {
      var oDetail = opts.detailModel;
      if (!oDetail) return MessageToast.show(I18n.text(null, "msg.detailModelNotFound", [], "Model 'detail' non trovato"));
      if (!oDetail.getProperty("/__canCopyRow")) return MessageToast.show(I18n.text(null, "msg.noPermissionCopyRows", [], "Non hai permessi per copiare righe"));

      var aSel = opts.getSelectedParentObjectsFn();
      if (!aSel.length) return MessageToast.show(I18n.text(null, "msg.selectRecordToCopy", [], "Seleziona un record da copiare"));
      if (aSel.length > 1) return MessageToast.show(I18n.text(null, "msg.selectSingleRecordToCopy", [], "Seleziona un solo record da copiare"));

      var oSource = aSel[0];
      var sSourceGuid = N.toStableString(oSource.guidKey || oSource.Guid || oSource.GUID || "");
      if (!sSourceGuid) return MessageToast.show(I18n.text(null, "msg.recordWithoutGuidCannotCopy", [], "Record senza Guid, impossibile copiare"));

      var oVm = opts.vmModel;
      var sCacheKey = opts.cacheKey;
      var aRawAll = oVm.getProperty(VmPaths.dataRowsByKeyPath(sCacheKey)) || [];
      var aSourceRaws = aRawAll.filter(function (r) {
        return N.toStableString(RecordsUtil.rowGuidKey(r)) === sSourceGuid;
      });
      if (!aSourceRaws.length) return MessageToast.show(I18n.text(null, "msg.noDetailRowsForRecord", [], "Nessuna riga dettaglio trovata per questo record"));

      var aAll = oDetail.getProperty("/RecordsAll") || [];
      var iMax = -1;
      aAll.forEach(function (r) {
        var n = parseInt(r && r.idx, 10);
        if (!isNaN(n) && n > iMax) iMax = n;
      });

      var oClone = RowManagementUtil.cloneRecordForCopy({
        source: oSource,
        sourceRaws: aSourceRaws,
        newIdx: iMax + 1,
        newGuid: N.genGuidNew(),
        attachmentUiKeys: RowManagementUtil.collectAttachmentUiKeys(oDetail),
        statusText: RecordsUtil.statusText
      });

      oDetail.setProperty("/RecordsAll", aAll.concat([oClone.parent]));
      oVm.setProperty(VmPaths.recordsByKeyPath(sCacheKey), (oVm.getProperty(VmPaths.recordsByKeyPath(sCacheKey)) || []).concat([oClone.parent]));
      oVm.setProperty(VmPaths.dataRowsByKeyPath(sCacheKey), (oVm.getProperty(VmPaths.dataRowsByKeyPath(sCacheKey)) || []).concat(oClone.raws));

      Screen4CacheUtil.setSelectedParentForScreen4(oClone.parent, oVm, opts.component);
      Screen4CacheUtil.ensureScreen4CacheForParentIdx(oClone.idx, oClone.guid, oVm, opts.cacheKeySafe);
      opts.applyClientFiltersFn();

      var aFiltered = oDetail.getProperty("/Records") || [];
      var iNewRowIndex = aFiltered.length - 1;
      if (iNewRowIndex >= 0) MdcTableUtil.scrollToRow(opts.table, iNewRowIndex);

      MessageToast.show(I18n.text(null, "msg.recordCopiedWithDetailRows", [oClone.raws.length], "Record copiato ({0} righe dettaglio)"));
    },

    onDeleteRows: function (opts) {
      var oDetail = opts.detailModel;
      if (!oDetail) return MessageToast.show(I18n.text(null, "msg.detailModelNotFound", [], "Model 'detail' non trovato"));

      var aSel = opts.getSelectedParentObjectsFn();
      if (!aSel.length) return MessageToast.show(I18n.text(null, "msg.selectAtLeastOneRowToDelete", [], "Seleziona almeno una riga da eliminare"));
      if (!RowManagementUtil.canDeleteSelectedRows(aSel).canDelete) return MessageToast.show(I18n.text(null, "msg.cannotDeleteApprovedVendorBatch", [], "Non puoi eliminare partita fornitore approvati"));
      var aIdxToRemove = RowManagementUtil.getIdxToRemove(aSel);
      if (!aIdxToRemove.length) return MessageToast.show(I18n.text(null, "msg.noValidIdxInSelectedRows", [], "Nessun idx valido nelle righe selezionate"));

      var aDeletedParents = oDetail.getProperty("/__deletedParents") || [];
      aSel.forEach(function (r) {
        var g = (r && (r.GUID || r.Guid || r.guidKey)) || "";
        if (g && String(g).indexOf("-new") < 0) aDeletedParents.push(r);
      });
      oDetail.setProperty("/__deletedParents", aDeletedParents);
      oDetail.setProperty("/RecordsAll", (oDetail.getProperty("/RecordsAll") || []).filter(function (r) {
        return aIdxToRemove.indexOf(parseInt(r && r.idx, 10)) < 0;
      }));

      var oVm = opts.vmModel;
      var sKeyCache = opts.cacheKey;
      var mDelPair = {};
      var mDelGuid = {};
      aSel.forEach(function (p) {
        var g = N.toStableString(p && (p.guidKey || p.GUID || p.Guid));
        var f = N.toStableString(p && p.Fibra);
        if (g && f) mDelPair[g + "||" + f] = true;
        else if (g) mDelGuid[g] = true;
      });
      oVm.setProperty(VmPaths.recordsByKeyPath(sKeyCache), (oVm.getProperty(VmPaths.recordsByKeyPath(sKeyCache)) || []).filter(function (r) {
        return aIdxToRemove.indexOf(parseInt(r && r.idx, 10)) < 0;
      }));

      var aRowsCacheBefore = oVm.getProperty(VmPaths.dataRowsByKeyPath(sKeyCache)) || [];
      aSel.forEach(function (p) {
        PostUtil.stashDeleteForPostFromCache(p, aRowsCacheBefore, oDetail, {
          toStableString: N.toStableString,
          rowGuidKey: RecordsUtil.rowGuidKey
        });
      });
      oVm.setProperty(VmPaths.dataRowsByKeyPath(sKeyCache), (oVm.getProperty(VmPaths.dataRowsByKeyPath(sKeyCache)) || []).filter(function (r) {
        var g = RecordsUtil.rowGuidKey(r);
        var f = RecordsUtil.rowFibra(r);
        return !(mDelPair[g + "||" + f] || mDelGuid[g]);
      }));

      Screen4CacheUtil.purgeScreen4CacheByParentIdx(aIdxToRemove, oVm, opts.cacheKeySafe);
      var oSel = Screen4CacheUtil.getSelectedParentForScreen4(opts.component.getModel("vm"));
      if (oSel && aIdxToRemove.indexOf(parseInt(oSel.idx, 10)) >= 0) {
        Screen4CacheUtil.setSelectedParentForScreen4(null, oVm, opts.component);
      }

      opts.applyClientFiltersFn();
      opts.clearSelectionFn();
      MessageToast.show(I18n.text(null, "msg.rowsDeleted", [], "Righe eliminate"));
    }
  };
});
