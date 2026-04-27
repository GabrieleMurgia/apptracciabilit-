sap.ui.define([
  "apptracciabilita/apptracciabilita/controller/BaseController",
  "apptracciabilita/apptracciabilita/util/screen6FlowUtil",
  "apptracciabilita/apptracciabilita/util/screen5FlowUtil",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/HBox",
  "sap/m/ObjectStatus",

  // ===== UTIL =====
  "apptracciabilita/apptracciabilita/util/domains",
  "apptracciabilita/apptracciabilita/util/cellTemplateUtil",
  "apptracciabilita/apptracciabilita/util/i18nUtil"

], function (
  BaseController, Screen6FlowUtil, Screen5FlowUtil, JSONModel, MessageToast,
  HBox, ObjectStatus,
  Domains, CellTemplateUtil, I18n
) {
  "use strict";

  return BaseController.extend("apptracciabilita.apptracciabilita.controller.Screen5", {

    _sLogPrefix: "[S5]",
    MAIN_TABLE_ID: "mdcTable5",
    MAIN_INPUT_FILTER_ID: "inputFilter5",

    // ==================== INIT ====================
    onInit: function () {
      var oVm = this._getOVm();
      oVm.setProperty("/mdcCfg/screen5", { modelName: "detail", collectionPath: "/Rows", properties: [] });

      this._log("onInit");
      this.getOwnerComponent().getRouter().getRoute("Screen5").attachPatternMatched(this._onRouteMatched, this);

      this.getView().setModel(new JSONModel({ showHeaderFilters: false, showHeaderSort: true }), "ui");
      this.getView().setModel(new JSONModel({
        selectedCat: "",
        RowsAll: [], Rows: [], RowsCount: 0,
        _mmct: { cat: "", s01: [], s02: [] },
        __q: "", __statusFilter: "",
        __loaded: false
      }), "detail");

      this._inlineFS = { filters: {}, sort: { key: "", desc: false }, sortBtns: {}, filterInputs: {}, headerTitles: {}, headerRows: {}, headerBoxes: {} };
    },

    // ==================== ROUTE ====================
    _onRouteMatched: function (oEvent) {
      var self = this;
      this._ensureUserInfosLoaded().then(function () {
        self._log("_onRouteMatched");

        var oVm = self.getOwnerComponent().getModel("vm");
        Screen6FlowUtil.buildCategoriesList({ vmModel: oVm });
        self._log("Categories built", { count: (oVm.getProperty("/userCategoriesList") || []).length });

        // Reset detail
        var oDetail = self.getView().getModel("detail");
        oDetail.setData({
          selectedCat: oDetail.getProperty("/selectedCat") || "",
          RowsAll: [], Rows: [], RowsCount: 0,
          _mmct: { cat: "", s01: [], s02: [] },
          __q: "", __statusFilter: "",
          __loaded: false
        }, true);

        var oInp = self.byId("inputFilter5");
        if (oInp && oInp.setValue) oInp.setValue("");
        self._inlineFS = { filters: {}, sort: { key: "", desc: false }, sortBtns: {}, filterInputs: {}, headerTitles: {}, headerRows: {}, headerBoxes: {} };
      });
    },

    // ==================== LOAD DATA ====================
    onLoadData: function () {
      var oDetail = this.getView().getModel("detail");
      var sCat = String(oDetail.getProperty("/selectedCat") || "").trim();
      if (!sCat) {
        MessageToast.show(I18n.text(this, "msg.selectMaterialCategory", [], "Seleziona una Categoria Materiale"));
        return;
      }

      this._log("onLoadData", { cat: sCat });
      this._loadDataByCat(sCat);
    },

    _loadDataByCat: function (sCat) {
      Screen5FlowUtil.loadDataByCat({
        cat: sCat,
        vmModel: this.getOwnerComponent().getModel("vm"),
        odataModel: this.getOwnerComponent().getModel(),
        logFn: this._log.bind(this),
        onDataLoadedFn: this._onDataLoaded.bind(this)
      });
    },

    _onDataLoaded: function (aRows, sCat) {
      Screen5FlowUtil.onDataLoaded({
        rows: aRows,
        cat: sCat,
        detailModel: this.getView().getModel("detail"),
        vmModel: this.getOwnerComponent().getModel("vm"),
        inputFilter: this.byId("inputFilter5"),
        logFn: this._log.bind(this),
        resetInlineFsFn: function () {
          this._inlineFS = { filters: {}, sort: { key: "", desc: false }, sortBtns: {}, filterInputs: {}, headerTitles: {}, headerRows: {}, headerBoxes: {} };
        }.bind(this),
        bindTableFn: this._bindTable.bind(this)
      });
    },

    // ==================== TABLE BINDING ====================
    _bindTable: async function (aRows) {
      await Screen5FlowUtil.bindTable({
        rows: aRows,
        detailModel: this.getView().getModel("detail"),
        vmModel: this.getOwnerComponent().getModel("vm"),
        table: this.byId("mdcTable5"),
        getSelectedCatFn: function () {
          var oCombo = this.byId("comboMatCat5");
          return String((oCombo && oCombo.getSelectedKey && oCombo.getSelectedKey()) || "").trim();
        }.bind(this),
        logFn: this._log.bind(this),
        createStatusCellTemplateFn: this._createStatusCellTemplate.bind(this),
        createReadOnlyCellTemplateFn: this._createReadOnlyCellTemplate.bind(this),
        applyInlineHeaderFilterSortFn: this._applyInlineHeaderFilterSort.bind(this),
        applyClientFiltersFn: this._applyClientFilters.bind(this),
        scheduleHeaderFilterSortFn: this._scheduleHeaderFilterSort.bind(this)
      });
    },

    _createReadOnlyCellTemplate: function (sKey, oMeta) {
      // Use standard cell template — rows have __readOnly = true so all cells are non-editable
      return CellTemplateUtil.createCellTemplate(sKey, oMeta, {
        view: this.getView(),
        domainHasValuesFn: function (d) { return Domains.domainHasValues(this.getOwnerComponent(), d); }.bind(this),
        hookDirtyOnEditFn: function () { /* no-op: Screen5 is read-only */ }
      });
    },

    _createStatusCellTemplate: function (sKey) {
      var sBindKey = (String(sKey || "").toUpperCase() === "STATO") ? "Stato" : sKey;
      var sStateExpr =
        "{= (${detail>" + sBindKey + "} === '' ? 'Warning' : " +
        "(${detail>" + sBindKey + "} === 'AP' ? 'Success' : " +
        "(${detail>" + sBindKey + "} === 'RJ' ? 'Error' : " +
        "(${detail>" + sBindKey + "} === 'CH' ? 'Information' : " +
        "(${detail>" + sBindKey + "} === 'ST' ? 'Warning' : 'None')))))}";

      return new HBox({ width: "100%", justifyContent: "Center", alignItems: "Center",
        items: [
          new ObjectStatus({ text: "",
            icon: "{= ${detail>" + sBindKey + "} === 'RJ' ? 'sap-icon://alert' : 'sap-icon://circle-task' }",
            state: sStateExpr,
            tooltip: "{= 'Stato: ' + (${detail>" + sBindKey + "} || '') }"
          })
        ]
      });
    },

    // ==================== FILTERS (adapted for Screen5: /RowsAll -> /Rows) ====================
    _applyClientFilters: function () {
      var oDetail = this.getView().getModel("detail");
      var aAll = oDetail.getProperty("/RowsAll") || [];
      var q = String(oDetail.getProperty("/__q") || "").trim().toUpperCase();
      var sStatus = String(oDetail.getProperty("/__statusFilter") || "").trim().toUpperCase();

      var aFiltered = (aAll || []).filter(function (r) {
        if (sStatus) {
          var st = String((r && (r.__status || r.Stato)) || "").trim().toUpperCase();
          if (st !== sStatus) return false;
        }
        if (q) {
          var ok = Object.keys(r || {}).some(function (k) {
            if (k === "__metadata" || k === "AllData") return false;
            if (k.indexOf("__") === 0) return false;
            var v = r[k];
            if (v === null || v === undefined) return false;
            if (Array.isArray(v)) v = v.join(", ");
            return String(v).toUpperCase().indexOf(q) >= 0;
          });
          if (!ok) return false;
        }
        return true;
      });

      // Inline column filters
      var mCol = (this._inlineFS && this._inlineFS.filters) || {};
      var aColKeys = Object.keys(mCol).filter(function (k) {
        return String(mCol[k] || "").trim() !== "";
      });
      if (aColKeys.length) {
        aFiltered = aFiltered.filter(function (r) {
          return aColKeys.every(function (k) {
            var wanted = String(mCol[k] || "").trim().toUpperCase();
            if (!wanted) return true;
            var v = (r && r[k] != null) ? r[k] : "";
            if (Array.isArray(v)) v = v.join(", ");
            return String(v).toUpperCase().indexOf(wanted) >= 0;
          });
        });
      }

      // Inline sort
      var st2 = (this._inlineFS && this._inlineFS.sort) || { key: "", desc: false };
      if (st2.key) {
        var key = st2.key, desc = !!st2.desc;
        aFiltered.sort(function (a, b) {
          var va = (a && a[key] != null) ? a[key] : "";
          var vb = (b && b[key] != null) ? b[key] : "";
          if (Array.isArray(va)) va = va.join(", ");
          if (Array.isArray(vb)) vb = vb.join(", ");
          va = String(va); vb = String(vb);
          var cmp = va.localeCompare(vb, undefined, { numeric: true, sensitivity: "base" });
          return desc ? -cmp : cmp;
        });
      }

      oDetail.setProperty("/Rows", aFiltered);
      oDetail.setProperty("/RowsCount", aFiltered.length);
      var oTbl = this.byId("mdcTable5");
      if (oTbl && typeof oTbl.rebind === "function") oTbl.rebind();
    },
    onStatusFilterPress: function (oEvt) {
      var oDetail = this.getView().getModel("detail");
      var sSrc = oEvt.getSource();
      var sVal = "";
      try { sVal = (sSrc.data && sSrc.data("status")) || ""; } catch (e) { console.debug("[Screen5] suppressed error", e); }
      oDetail.setProperty("/__statusFilter", sVal);
      this._applyClientFilters();
    },
    onGlobalFilter: function (oEvt) {
      var oDetail = this.getView().getModel("detail");
      oDetail.setProperty("/__q", String(oEvt.getParameter("value") || ""));
      this._applyClientFilters();
    },

    // ==================== EXPORT ====================
    onExportExcel: async function () {
      await Screen5FlowUtil.exportExcel({
        context: this,
        detailModel: this.getView().getModel("detail"),
        vmModel: this.getOwnerComponent().getModel("vm")
      });
    },
    // ==================== NAVIGATION ====================
    _getNavBackFallback: function () {
      return { route: "Screen0", params: {} };
    }
  });
});
