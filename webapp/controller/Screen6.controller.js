sap.ui.define([
  "apptracciabilita/apptracciabilita/controller/BaseController",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "sap/ui/core/BusyIndicator",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/mdc/table/Column",
  "sap/m/HBox",
  "sap/m/Text",
  "sap/ui/mdc/p13n/StateUtil",

  // ===== UTIL =====
  "apptracciabilita/apptracciabilita/util/normalize",
  "apptracciabilita/apptracciabilita/util/domains",
  "apptracciabilita/apptracciabilita/util/mdcTableUtil",
  "apptracciabilita/apptracciabilita/util/p13nUtil",
  "apptracciabilita/apptracciabilita/util/filterSortUtil",
  "apptracciabilita/apptracciabilita/util/mmctUtil",
  "apptracciabilita/apptracciabilita/util/TableColumnAutoSize",
  "apptracciabilita/apptracciabilita/util/postUtil",
  "apptracciabilita/apptracciabilita/util/recordsUtil",
  "apptracciabilita/apptracciabilita/util/s6ExcelUtil",
  "apptracciabilita/apptracciabilita/util/screen6FlowUtil",
  "apptracciabilita/apptracciabilita/util/i18nUtil"

], function (
  BaseController, JSONModel, MessageToast, MessageBox, BusyIndicator,
  Filter, FilterOperator, MdcColumn, HBox, Text, StateUtil,
  N, Domains, MdcTableUtil, P13nUtil,
  FilterSortUtil, MmctUtil, TableColumnAutoSize,
  PostUtil, RecordsUtil, S6Excel, Screen6FlowUtil, I18n
) {
  "use strict";

  return BaseController.extend("apptracciabilita.apptracciabilita.controller.Screen6", {

    _sLogPrefix: "[S6]",
    MAIN_TABLE_ID: "mdcTable6",
    MAIN_INPUT_FILTER_ID: "inputFilter6",

    // ==================== INIT ====================
    onInit: function () {
      var oVm = this._getOVm();
      oVm.setProperty("/mdcCfg/screen6", { modelName: "detail", collectionPath: "/Rows", properties: [] });

      this._log("onInit");
      this.getOwnerComponent().getRouter().getRoute("Screen6").attachPatternMatched(this._onRouteMatched, this);

      this.getView().setModel(new JSONModel({ showHeaderFilters: false, showHeaderSort: true }), "ui");
      this.getView().setModel(new JSONModel({
        selectedCat: "",
        RowsAll: [], Rows: [], RowsCount: 0,
        _mmct: { cat: "", s01: [], s02: [] },
        __q: "",
        checkDone: false,
        checkPassed: false,
        checkErrorCount: 0
      }), "detail");

      this._inlineFS = { filters: {}, sort: { key: "", desc: false }, sortBtns: {}, filterInputs: {}, headerTitles: {}, headerRows: {}, headerBoxes: {} };
      this._xlsxLoaded = false;
    },

    // ==================== ROUTE ====================
    _onRouteMatched: function () {
      var self = this;
      this._ensureUserInfosLoaded().then(function () {
        self._log("_onRouteMatched");
        self._buildCategoriesList();
      });
    },

    _buildCategoriesList: function () {
      return Screen6FlowUtil.buildCategoriesList({
        vmModel: this.getOwnerComponent().getModel("vm")
      });
    },

    _getSelectedCat: function () {
      var oCombo = this.byId("comboCatMat6");
      return (oCombo && oCombo.getSelectedKey()) || "";
    },

    // ==================== DOWNLOAD TEMPLATE ====================
    onDownloadTemplate: function () {
      return Screen6FlowUtil.onDownloadTemplate({
        getSelectedCatFn: this._getSelectedCat.bind(this),
        odataModel: this.getOwnerComponent().getModel()
      });
    },

    // ==================== DOWNLOAD MATERIAL LIST ====================
    onDownloadMaterialList: function () {
      return Screen6FlowUtil.onDownloadMaterialList({
        getSelectedCatFn: this._getSelectedCat.bind(this),
        odataModel: this.getOwnerComponent().getModel(),
        exportMaterialListToExcelFn: this._exportMaterialListToExcel.bind(this)
      });
    },

    _exportMaterialListToExcel: async function (aResults, sCat) {
      return Screen6FlowUtil.exportMaterialListToExcel({
        results: aResults,
        cat: sCat,
        vmModel: this.getOwnerComponent().getModel("vm")
      });
    },
    // ==================== UPLOAD FILE ====================
    onFileSelected: function (oEvt) {
      return Screen6FlowUtil.onFileSelected({
        event: oEvt,
        getSelectedCatFn: this._getSelectedCat.bind(this),
        clearFileUploaderFn: function () { this.byId("fileUploader6").clear(); }.bind(this),
        ensureXlsxLoadedFn: this._ensureXlsxLoaded.bind(this),
        parseExcelFileFn: this._parseExcelFile.bind(this)
      });
    },

    _ensureXlsxLoaded: function () {
      if (window.XLSX) return Promise.resolve();
      if (this._xlsxPromise) return this._xlsxPromise;

      var self = this;
      this._xlsxPromise = new Promise(function (resolve, reject) {
        // Try loading from local project first, then CDN
        var aPaths = [
          jQuery.sap.getModulePath("apptracciabilita/apptracciabilita") + "/lib/xlsx.full.min.js",
          "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"
        ];

        function tryLoad(idx) {
          if (idx >= aPaths.length) {
            reject(new Error("XLSX library not found"));
            return;
          }
          var oScript = document.createElement("script");
          oScript.src = aPaths[idx];
          oScript.onload = function () {
            if (window.XLSX) {
              self._xlsxLoaded = true;
              resolve();
            } else {
              tryLoad(idx + 1);
            }
          };
          oScript.onerror = function () { tryLoad(idx + 1); };
          document.head.appendChild(oScript);
        }

        tryLoad(0);
      });

      return this._xlsxPromise;
    },

    _parseExcelFile: function (oFile, sCat) {
      return Screen6FlowUtil.parseExcelFile({
        file: oFile,
        cat: sCat,
        logFn: this._log.bind(this),
        genGuidFn: N.genGuidNew,
        mapExcelToMmctFieldsFn: this._mapExcelToMmctFields.bind(this),
        executeCheckFn: this._executeCheck.bind(this)
      });
    },

    // ==================== MAP EXCEL HEADERS → MMCT FIELDS ====================
    _mapExcelToMmctFields: function (aJsonRows, sCat) {
      return Screen6FlowUtil.mapExcelToMmctFields({
        jsonRows: aJsonRows,
        cat: sCat,
        vmModel: this.getOwnerComponent().getModel("vm")
      });
    },

    // ==================== CHECK DATA (auto after upload) ====================
    _buildPayloadLines: function (aRows, sCat) {
      return Screen6FlowUtil.buildPayloadLines({
        rows: aRows,
        cat: sCat,
        vmModel: this.getOwnerComponent().getModel("vm"),
        detailModel: this.getView().getModel("detail")
      });
    },

    _executeCheck: function (aRows, sCat) {
      return Screen6FlowUtil.executeCheck({
        rows: aRows,
        cat: sCat,
        odataModel: this.getOwnerComponent().getModel(),
        vmModel: this.getOwnerComponent().getModel("vm"),
        detailModel: this.getView().getModel("detail"),
        populatePreviewTableFn: this._populatePreviewTable.bind(this),
        updateCheckErrorRowStylesFn: this._updateCheckErrorRowStyles.bind(this)
      });
    },

    _processCheckResponse: function (aRows, oData) {
      S6Excel.applyCheckResponse(aRows, oData);
      var oDetail = this.getView().getModel("detail");
      oDetail.setProperty("/checkErrorCount", (aRows || []).filter(function (r) { return !!r.__checkHasError; }).length);
      oDetail.setProperty("/checkPassed", !((aRows || []).some(function (r) { return !!r.__checkHasError; })));
      oDetail.setProperty("/checkDone", true);
    },

    // ==================== CHECK ERROR ROW HIGHLIGHTING ====================
    _updateCheckErrorRowStyles: function () {
      var oMdcTbl = this.byId("mdcTable6");
      if (!oMdcTbl) { console.log("[S6] ROW-STYLE: mdcTable6 not found"); return; }

      var oInner = MdcTableUtil.getInnerTableFromMdc(oMdcTbl);
      if (!oInner) { console.log("[S6] ROW-STYLE: inner table not found"); return; }

      // GridTable (sap.ui.table.Table)
      if (oInner.isA && oInner.isA("sap.ui.table.Table")) {
        var aRows = (oInner.getRows && oInner.getRows()) || [];
        var iMarked = 0;
        aRows.forEach(function (oRowCtrl) {
          if (!oRowCtrl) return;
          var oCtx = oRowCtrl.getBindingContext("detail") || oRowCtrl.getBindingContext();
          var oObj = oCtx && oCtx.getObject && oCtx.getObject();
          if (oObj && oObj.__checkHasError) {
            oRowCtrl.addStyleClass("s3PostErrorRow");
            iMarked++;
          } else {
            oRowCtrl.removeStyleClass("s3PostErrorRow");
          }
        });
        // Re-apply on scroll
        var self = this;
        if (!this._s6ErrorScrollHooked) {
          this._s6ErrorScrollHooked = true;
          oInner.attachFirstVisibleRowChanged(function () {
            setTimeout(function () { self._updateCheckErrorRowStyles(); }, 100);
          });
        }
        return;
      }

      // ResponsiveTable (sap.m.Table)
      if (oInner.isA && (oInner.isA("sap.m.Table") || oInner.isA("sap.m.ListBase"))) {
        var aItems = (oInner.getItems && oInner.getItems()) || [];
        var iMarked2 = 0;
        aItems.forEach(function (it) {
          if (!it) return;
          var oCtx2 = it.getBindingContext("detail") || it.getBindingContext();
          var oObj2 = oCtx2 && oCtx2.getObject && oCtx2.getObject();
          if (oObj2 && oObj2.__checkHasError) {
            it.addStyleClass("s3PostErrorRow");
            iMarked2++;
          } else {
            it.removeStyleClass("s3PostErrorRow");
          }
        });
      }
    },

    // ==================== POPULATE PREVIEW TABLE ====================
    _populatePreviewTable: async function (aRows, sCat) {
      var oDetail = this.getView().getModel("detail");
      var oVm = this.getOwnerComponent().getModel("vm");

      // Set category and hydrate MMCT
      oDetail.setProperty("/_mmct/cat", sCat);
      var aRawFields = (oVm.getProperty("/mmctFieldsByCat/" + sCat)) || [];
      var oPreviewCfg = S6Excel.buildPreviewConfig(aRawFields);
      var aCfgAll = oPreviewCfg.cfgAll;

      // Set rows
      oDetail.setProperty("/RowsAll", aRows);
      oDetail.setProperty("/Rows", aRows);
      oDetail.setProperty("/RowsCount", aRows.length);

      // Set MDC config
      oVm.setProperty("/mdcCfg/screen6", { modelName: "detail", collectionPath: "/Rows", properties: oPreviewCfg.props });

      // Rebuild table columns
      var oTbl = this.byId("mdcTable6");
      if (!oTbl) return;

      this._inlineFS = MdcTableUtil.ensureInlineFS(this._inlineFS);
      MdcTableUtil.resetInlineHeaderControls(this._inlineFS);
      await this._rebuildColumnsHard(oTbl, aCfgAll);
      TableColumnAutoSize.autoSize(oTbl, 60);

      if (oTbl.initialized) await oTbl.initialized();
      oTbl.setModel(oDetail, "detail");

      await this._applyInlineHeaderFilterSort(oTbl);
      this._applyClientFilters();
      if (typeof oTbl.rebind === "function") oTbl.rebind();

      await P13nUtil.forceP13nAllVisible(oTbl, StateUtil, this._log.bind(this), "t0");
      await this._applyInlineHeaderFilterSort(oTbl);

      this._scheduleHeaderFilterSort(oTbl);
    },

    // ==================== TABLE COLUMNS ====================
    _rebuildColumnsHard: async function (oTbl, aCfgAll) {
      if (!oTbl) return;
      if (oTbl.initialized) await oTbl.initialized();

      var aOld = (oTbl.getColumns && oTbl.getColumns()) || [];
      aOld.slice().forEach(function (c) { oTbl.removeColumn(c); c.destroy(); });

      var seen = Object.create(null);
      var aCfgUnique = (aCfgAll || []).filter(function (f) {
        var ui = String(f && f.ui || "").trim();
        if (!ui) return false;
        if (ui.toUpperCase() === "STATO") return false;
        var k = ui.toUpperCase();
        if (seen[k]) return false;
        seen[k] = true;
        return true;
      });

      var mP = MdcColumn.getMetadata().getAllProperties();

      aCfgUnique.forEach(function (f) {
        var sKey = String(f.ui || "").trim();
        if (!sKey) return;
        var sHeader = (f.label || sKey) + (f.required ? " *" : "");
        var oColProps = {
          header: sHeader, visible: true, dataProperty: sKey,
          template: this._createCellTemplate(sKey, f)
        };
        if (mP.propertyKey) oColProps.propertyKey = sKey;
        oTbl.addColumn(new MdcColumn(oColProps));
      }.bind(this));
    },

    _createCellTemplate: function (sKey) {
      // Screen6: read-only preview — always use Text
      return new Text({ text: "{detail>" + sKey + "}", wrapping: false });
    },

    // ==================== FILTERS ====================
    _applyClientFilters: function () {
      FilterSortUtil.applyClientFilters(this.getView().getModel("detail"), this._inlineFS, this.byId("mdcTable6"));
    },
    onGlobalFilter: function (oEvt) { FilterSortUtil.onGlobalFilter(oEvt, this.getView().getModel("detail"), this._applyClientFilters.bind(this)); },

    // ==================== CLEAR UPLOAD ====================
    onClearUpload: function () {
      return Screen6FlowUtil.onClearUpload({
        detailModel: this.getView().getModel("detail"),
        clearFileUploaderFn: function () { this.byId("fileUploader6").clear(); }.bind(this),
        setErrorScrollHookedFn: function (bVal) { this._s6ErrorScrollHooked = bVal; }.bind(this)
      });
    },

    // ==================== EXPORT PREVIEW ====================
    onExportExcel: async function () {
      return Screen6FlowUtil.onExportExcel({
        detailModel: this.getView().getModel("detail")
      });
    },

    // ==================== SEND DATA (POST) ====================
    onSendData: function () {
      return Screen6FlowUtil.onSendData({
        detailModel: this.getView().getModel("detail"),
        vmModel: this.getOwnerComponent().getModel("vm"),
        odataModel: this.getOwnerComponent().getModel(),
        getSelectedCatFn: this._getSelectedCat.bind(this),
        clearUploadFn: this.onClearUpload.bind(this)
      });
    },

    _validateRequiredFieldsForRows: function (aRows, sCat) {
      return Screen6FlowUtil.validateRequiredFieldsForRows({
        rows: aRows,
        cat: sCat,
        vmModel: this.getOwnerComponent().getModel("vm")
      });
    },

    _filterOutCheckErrorRows: function (aRows, oDetail) {
      return Screen6FlowUtil.filterOutCheckErrorRows({
        rows: aRows,
        detailModel: oDetail
      });
    },

    _executePost: function (aRows, sCat) {
      return Screen6FlowUtil.executePost({
        rows: aRows,
        cat: sCat,
        odataModel: this.getOwnerComponent().getModel(),
        vmModel: this.getOwnerComponent().getModel("vm"),
        detailModel: this.getView().getModel("detail"),
        clearUploadFn: this.onClearUpload.bind(this)
      });
    },
    // ==================== NAV ====================
    _getNavBackFallback: function () {
      return { route: "Screen0", params: {} };
    }
  });
});
