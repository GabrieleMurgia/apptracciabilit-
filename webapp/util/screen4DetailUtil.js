sap.ui.define([
  "sap/ui/mdc/table/Column",
  "sap/ui/mdc/p13n/StateUtil",
  "apptracciabilita/apptracciabilita/util/normalize",
  "apptracciabilita/apptracciabilita/util/vmModelPaths",
  "apptracciabilita/apptracciabilita/util/statusUtil",
  "apptracciabilita/apptracciabilita/util/screen4LoaderUtil",
  "apptracciabilita/apptracciabilita/util/mdcTableUtil",
  "apptracciabilita/apptracciabilita/util/p13nUtil",
  "apptracciabilita/apptracciabilita/util/TableColumnAutoSize",
  "apptracciabilita/apptracciabilita/util/screenFlowStateUtil"
], function (MdcColumn, StateUtil, N, VmPaths, StatusUtil, S4Loader, MdcTableUtil, P13nUtil, TableColumnAutoSize, ScreenFlowStateUtil) {
  "use strict";

  function resolveOrSynthRowsForGuid(opts) {
    var aByGuid = (opts.allRows || []).filter(function (r) {
      return N.toStableString(S4Loader.rowGuidKey(r) || (r && r.guidKey)) === N.toStableString(opts.guid);
    });
    if (aByGuid.length) return aByGuid;

    var sRecFibra = N.toStableString(opts.record.Fibra || opts.record.FIBRA || opts.record.Fiber || opts.record.FIBER || "");
    var oS = N.deepClone(opts.selectedParent || opts.record) || {};
    oS.guidKey = opts.guid;
    oS.Guid = opts.guid;
    oS.GUID = opts.guid;
    oS.Fibra = sRecFibra || N.toStableString((opts.selectedParent && (opts.selectedParent.Fibra || opts.selectedParent.FIBRA)) || "") || "";
    if (oS.Approved == null) oS.Approved = 0;
    if (oS.ToApprove == null) oS.ToApprove = 1;
    if (oS.Rejected == null) oS.Rejected = 0;
    oS.__synthetic = true;
    oS.__localId = oS.__localId || ("SYNTH_" + Date.now());

    var aNext = (opts.allRows || []).slice();
    aNext.push(oS);
    opts.vmModel.setProperty(VmPaths.dataRowsByKeyPath(opts.cacheKey), aNext);
    return [oS];
  }

  function applyGroupStatusAndPerms(opts) {
    var sRole = String(opts.vmModel.getProperty("/userType") || "").trim().toUpperCase();
    var aRowSt = (opts.selectedRows || []).map(function (r) { return StatusUtil.normStatoRow(r, opts.vmModel); });
    var gSt;
    if (aRowSt.length && aRowSt.every(function (s) { return s === "AP"; })) gSt = "AP";
    else if (aRowSt.some(function (s) { return s === "RJ"; })) gSt = "RJ";
    else if (aRowSt.some(function (s) { return s === "CH"; })) gSt = "CH";
    else gSt = "ST";

    (opts.selectedRows || []).forEach(function (r) {
      r.Stato = StatusUtil.normStatoRow(r, opts.vmModel);
      r.__readOnly = !StatusUtil.canEdit(sRole, r.Stato);
    });

    opts.detailModel.setProperty("/__role", sRole);
    opts.detailModel.setProperty("/__status", gSt);
    opts.detailModel.setProperty("/__canEdit", StatusUtil.canEdit(sRole, gSt));
    opts.detailModel.setProperty("/__canAddRow", StatusUtil.canAddRow(sRole, gSt));
    opts.detailModel.setProperty("/__canApprove", false);
    opts.detailModel.setProperty("/__canReject", false);
  }

  function resolveCatForSelection(opts) {
    var r0 = (opts.selectedRows || [])[0] || {};
    var sCat = S4Loader.pickCat(r0) || S4Loader.pickCat(opts.record) || (opts.selectedParent ? S4Loader.pickCat(opts.selectedParent) : "") || "";
    if (!sCat) {
      var f1 = (opts.allRows || []).find(function (r) { return !!S4Loader.pickCat(r); });
      if (f1) sCat = S4Loader.pickCat(f1);
    }
    if (!sCat) {
      var f2 = (opts.records || []).find(function (r) { return !!S4Loader.pickCat(r); });
      if (f2) sCat = S4Loader.pickCat(f2);
    }
    if (sCat) {
      [r0, opts.record, opts.selectedParent].forEach(function (o) {
        if (o && !S4Loader.pickCat(o)) o.CatMateriale = sCat;
      });
    }
    return sCat;
  }

  function resolveCfg02ForSelection(opts) {
    var aCfg02 = opts.cat ? opts.cfgForScreenFn(opts.cat, "02") : [];
    if (aCfg02.length) return aCfg02;

    var r0 = (opts.selectedRows || [])[0] || {};
    aCfg02 = S4Loader.buildCfgFallbackFromObject(
      (opts.allRows || [])[0] || (opts.records || [])[0] || r0 || opts.record || {}
    );
    if (aCfg02.length > 1) return aCfg02;

    aCfg02 = S4Loader.buildCfgFallbackFromObject(r0);
    var m2 = {};
    aCfg02.forEach(function (x) { m2[x.ui] = x; });
    S4Loader.buildCfgFallbackFromObject(opts.record).forEach(function (x) {
      if (!m2[x.ui]) { m2[x.ui] = x; aCfg02.push(x); }
    });
    return aCfg02;
  }

  function applyCfg02NormalizationToRows(opts) {
    (opts.selectedRows || []).forEach(function (row) {
      (opts.cfg02 || []).forEach(function (f) {
        if (!f || !f.ui) return;
        var k = String(f.ui).trim();
        if (f.multiple) row[k] = opts.toArrayMultiFn(row[k]);
        else if (row[k] == null) row[k] = "";
      });
    });
  }

  function ensureMdcCfgScreen4(opts) {
    opts.vmModel.setProperty("/mdcCfg/screen4", {
      modelName: "detail",
      collectionPath: "/Rows",
      properties: opts.dedupeCfgByUiFn(opts.cfg02).map(function (f) {
        return { name: f.ui, label: f.label || f.ui, dataType: "String", domain: f.domain || "", required: !!f.required };
      })
    });
  }

  async function rebuildColumnsHard(opts) {
    var oTbl = opts.table;
    if (!oTbl) return;
    if (oTbl.initialized) await oTbl.initialized();
    ((oTbl.getColumns && oTbl.getColumns()) || []).slice().forEach(function (c) { oTbl.removeColumn(c); c.destroy(); });
    opts.dedupeCfgByUiFn(opts.cfg02).forEach(function (f) {
      var sKey = String(f.ui || "").trim();
      if (!sKey) return;
      var mP = MdcColumn.getMetadata().getAllProperties();
      var o = {
        header: (f.label || sKey) + (f.required ? " *" : ""),
        visible: true,
        dataProperty: sKey,
        template: opts.createCellTemplateFn(sKey, f)
      };
      if (mP.propertyKey) o.propertyKey = sKey;
      oTbl.addColumn(new MdcColumn(o));
    });
  }

  async function bindRowsAndColumns(opts) {
    var oD = opts.detailModel;
    var oTbl = opts.table;
    if (!oTbl) return;
    ensureMdcCfgScreen4({
      cfg02: oD.getProperty("/_mmct/s02") || [],
      vmModel: opts.vmModel,
      dedupeCfgByUiFn: opts.dedupeCfgByUiFn
    });
    await rebuildColumnsHard({
      table: oTbl,
      cfg02: oD.getProperty("/_mmct/s02") || [],
      dedupeCfgByUiFn: opts.dedupeCfgByUiFn,
      createCellTemplateFn: opts.createCellTemplateFn
    });
    TableColumnAutoSize.autoSize(opts.table, 60);
    if (oTbl.initialized) await oTbl.initialized();
    oTbl.setModel(oD, "detail");
    opts.setSnapshotRowsFn(N.deepClone(oD.getProperty("/RowsAll") || []));
    if (typeof oTbl.rebind === "function") oTbl.rebind();
    await P13nUtil.forceP13nAllVisible(oTbl, StateUtil, opts.logFn, "t0");
    setTimeout(function () { P13nUtil.forceP13nAllVisible(oTbl, StateUtil, opts.logFn, "t300"); }, 300);
    if (oTbl.initialized) oTbl.initialized().then(function () { opts.injectHeaderFiltersFn("bind"); });
    else opts.injectHeaderFiltersFn("bind");
    opts.applyUiPermissionsFn();
  }

  return {
    resolveOrSynthRowsForGuid: resolveOrSynthRowsForGuid,
    applyGroupStatusAndPerms: applyGroupStatusAndPerms,
    resolveCatForSelection: resolveCatForSelection,
    resolveCfg02ForSelection: resolveCfg02ForSelection,
    applyCfg02NormalizationToRows: applyCfg02NormalizationToRows,
    ensureMdcCfgScreen4: ensureMdcCfgScreen4,
    rebuildColumnsHard: rebuildColumnsHard,
    bindRowsAndColumns: bindRowsAndColumns,

    loadSelectedRecordRows: function (opts) {
      var aAllRows = opts.vmModel.getProperty(VmPaths.dataRowsByKeyPath(opts.cacheKey)) || null;
      var aRecords = opts.vmModel.getProperty(VmPaths.recordsByKeyPath(opts.cacheKey)) || null;

      function apply() {
        opts.applySelectedRecordToDetailFn(
          Array.isArray(aAllRows) ? aAllRows : [],
          Array.isArray(aRecords) ? aRecords : [],
          opts.cacheKey,
          opts.doneFn
        );
      }

      if (Array.isArray(aAllRows) && Array.isArray(aRecords) && (aAllRows.length || aRecords.length)) {
        apply();
        return;
      }

      var oNoMatListCtx = ScreenFlowStateUtil.getNoMatListContext(opts.vmModel);
      S4Loader.reloadDataFromBackend({
        oVm: opts.vmModel,
        oDataModel: opts.odataModel,
        vendorId: opts.vendorId,
        material: opts.material,
        catMateriale: oNoMatListCtx.catMateriale,
        season: ScreenFlowStateUtil.getCurrentSeason(opts.vmModel),
        logFn: opts.logFn
      }, function (aRes) {
        aAllRows = Array.isArray(aRes) ? aRes : [];
        var sCat = S4Loader.pickCat(aAllRows[0] || {});
        aRecords = S4Loader.buildRecords01ForCache(aAllRows, sCat ? opts.cfgForScreenFn(sCat, "01") : [], opts.vmModel);
        opts.vmModel.setProperty(VmPaths.dataRowsByKeyPath(opts.cacheKey), aAllRows);
        opts.vmModel.setProperty(VmPaths.recordsByKeyPath(opts.cacheKey), aRecords);
        apply();
      });
    },

    applySelectedRecordToDetail: function (opts) {
      var iIdx = parseInt(opts.recordKey, 10);
      if (isNaN(iIdx) || iIdx < 0) iIdx = 0;

      var oSel = ScreenFlowStateUtil.getSelectedParentForScreen4(opts.vmModel);
      if (oSel) opts.records[iIdx] = oSel;
      opts.vmModel.setProperty(VmPaths.recordsByKeyPath(opts.cacheKey), opts.records);

      var oRec = oSel || opts.records[iIdx] || opts.records[0] || null;
      if (!oRec) {
        opts.detailModel.setProperty("/RowsAll", []);
        opts.detailModel.setProperty("/Rows", []);
        opts.detailModel.setProperty("/RowsCount", 0);
        opts.detailModel.setProperty("/_mmct/cat", "");
        opts.detailModel.setProperty("/_mmct/s02", []);
        opts.applyUiPermissionsFn();
        if (typeof opts.doneFn === "function") opts.doneFn();
        return;
      }

      var sGuid = N.toStableString(
        oRec.guidKey || oRec.Guid || oRec.GUID || oRec.ItmGuid ||
        oRec.ItemGuid || oRec.GUID_ITM || oRec.GUID_ITM2 || ""
      );
      var aSelected = resolveOrSynthRowsForGuid({
        guid: sGuid,
        record: oRec,
        selectedParent: oSel,
        allRows: opts.allRows,
        cacheKey: opts.cacheKey,
        vmModel: opts.vmModel
      });
      opts.allRows = opts.vmModel.getProperty(VmPaths.dataRowsByKeyPath(opts.cacheKey)) || opts.allRows;

      applyGroupStatusAndPerms({
        selectedRows: aSelected,
        vmModel: opts.vmModel,
        detailModel: opts.detailModel
      });

      var sCat = resolveCatForSelection({
        selectedRows: aSelected,
        record: oRec,
        selectedParent: oSel,
        allRows: opts.allRows,
        records: opts.records
      });
      var aCfg02 = resolveCfg02ForSelection({
        cat: sCat,
        selectedRows: aSelected,
        record: oRec,
        allRows: opts.allRows,
        records: opts.records,
        cfgForScreenFn: opts.cfgForScreenFn
      });

      applyCfg02NormalizationToRows({
        selectedRows: aSelected,
        cfg02: aCfg02,
        toArrayMultiFn: opts.toArrayMultiFn
      });

      var oHdr = opts.buildHeader4FromMmct00Fn(sCat);
      opts.detailModel.setProperty("/_mmct/s00", oHdr.s00);
      opts.detailModel.setProperty("/_mmct/hdr4", oHdr.hdr4);
      opts.detailModel.setProperty("/_mmct/rec", oRec || oSel || {});
      opts.detailModel.setProperty("/_mmct/cat", sCat);
      opts.detailModel.setProperty("/_mmct/s02", aCfg02);
      opts.detailModel.setProperty("/guidKey", sGuid);
      opts.detailModel.setProperty("/Fibra", "");
      opts.detailModel.setProperty("/RowsAll", aSelected);
      opts.detailModel.setProperty("/Rows", aSelected);
      opts.detailModel.setProperty("/RowsCount", aSelected.length);
      opts.setSnapshotRowsFn(N.deepClone(aSelected));

      opts.refreshHeader4FieldsFn();
      opts.applyUiPermissionsFn();
      opts.applyFiltersAndSortFn();
      opts.syncAttachmentCountersFn();

      if (typeof opts.doneFn === "function") opts.doneFn();
    }
  };
});
