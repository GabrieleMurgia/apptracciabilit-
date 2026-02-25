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
  "sap/m/ObjectStatus",
  "sap/ui/mdc/p13n/StateUtil",

  // ===== UTIL =====
  "apptracciabilita/apptracciabilita/util/normalize",
  "apptracciabilita/apptracciabilita/util/domains",
  "apptracciabilita/apptracciabilita/util/statusUtil",
  "apptracciabilita/apptracciabilita/util/mdcTableUtil",
  "apptracciabilita/apptracciabilita/util/p13nUtil",
  "apptracciabilita/apptracciabilita/util/cellTemplateUtil",
  "apptracciabilita/apptracciabilita/util/postUtil",
  "apptracciabilita/apptracciabilita/util/exportUtil",
  "apptracciabilita/apptracciabilita/util/recordsUtil",
  "apptracciabilita/apptracciabilita/util/dataLoaderUtil",
  "apptracciabilita/apptracciabilita/util/filterSortUtil",
  "apptracciabilita/apptracciabilita/util/mmctUtil",
  "apptracciabilita/apptracciabilita/util/TableColumnAutoSize",
  "apptracciabilita/apptracciabilita/util/mockData"

], function (
  BaseController, JSONModel, MessageToast, MessageBox, BusyIndicator,
  Filter, FilterOperator, MdcColumn, HBox, ObjectStatus, StateUtil,
  N, Domains, StatusUtil, MdcTableUtil, P13nUtil,
  CellTemplateUtil, PostUtil, ExportUtil, RecordsUtil, DataLoaderUtil,
  FilterSortUtil, MmctUtil, TableColumnAutoSize,
  MockData
) {
  "use strict";

  return BaseController.extend("apptracciabilita.apptracciabilita.controller.Screen5", {

    _sLogPrefix: "[S5]",
    _sMockFlag: "mockS5",

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

        // Build categories list for ComboBox
        var oVm = self.getOwnerComponent().getModel("vm");
        var mCats = oVm.getProperty("/mmctFieldsByCat") || {};
        var aCatKeys = Object.keys(mCats);

        // Fallback: also extract CatMateriale from raw userCategories/userMMCT
        if (!aCatKeys.length) {
          var aMMCT = oVm.getProperty("/userCategories") || oVm.getProperty("/userMMCT") || oVm.getProperty("/UserInfosMMCT") || [];
          var catSeen = {};
          (aMMCT || []).forEach(function (cat) {
            var c = cat && (cat.CatMateriale || cat.CATMATERIALE || cat.Categoria || "");
            c = String(c || "").trim();
            if (c && !catSeen[c]) { catSeen[c] = true; aCatKeys.push(c); }
            // Also check nested fields
            var aFields = (cat.UserMMCTFields && cat.UserMMCTFields.results) || [];
            aFields.forEach(function (f) {
              var fc = String(f && f.CatMateriale || "").trim();
              if (fc && !catSeen[fc]) { catSeen[fc] = true; aCatKeys.push(fc); }
            });
          });
        }

        var aCatList = aCatKeys.map(function (k) {
          return { key: k, text: k };
        }).sort(function (a, b) { return a.text.localeCompare(b.text); });
        oVm.setProperty("/userCategoriesList", aCatList);
        self._log("Categories built", { count: aCatList.length, keys: aCatKeys });

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
        MessageToast.show("Seleziona una Categoria Materiale");
        return;
      }

      this._log("onLoadData", { cat: sCat });
      this._loadDataByCat(sCat);
    },

    _loadDataByCat: function (sCat) {
      var self = this;
      var oVm = this.getOwnerComponent().getModel("vm");
      var mock = (oVm && oVm.getProperty("/mock")) || {};
      var sUserId = (oVm && oVm.getProperty("/userId")) || "";

      // Build filters: OnlySaved eq 'X' + CatMateriale eq sCat
      var aFilters = [
        new Filter("UserID", FilterOperator.EQ, sUserId),
        new Filter("OnlySaved", FilterOperator.EQ, "X"),
        new Filter("CatMateriale", FilterOperator.EQ, sCat)
      ];

      // MOCK path
      if (mock.mockS5) {
        BusyIndicator.show(0);
        MockData.loadDataSetGeneric().then(function (aAll) {
          BusyIndicator.hide();
          var a = (Array.isArray(aAll) ? aAll : []).filter(function (r) {
            return String(r && r.CatMateriale || "").trim().toUpperCase() === sCat.toUpperCase();
          });
          self._onDataLoaded(a, sCat);
        }).catch(function (e) {
          BusyIndicator.hide();
          console.error("[S5] MOCK ERROR", e);
          MessageToast.show("Errore caricamento mock");
        });
        return;
      }

      // REAL OData call to DataSet
      BusyIndicator.show(0);
      var oODataModel = this.getOwnerComponent().getModel();
      oODataModel.read("/DataSet", {
        filters: aFilters,
        urlParameters: { "sap-language": "IT" },
        success: function (oData) {
          BusyIndicator.hide();
          var aResults = (oData && oData.results) || [];
          self._log("DataSet loaded", { count: aResults.length, cat: sCat });
          self._onDataLoaded(aResults, sCat);
        },
        error: function (oError) {
          BusyIndicator.hide();
          console.error("[S5] DataSet read ERROR", oError);
          MessageBox.error("Errore nel caricamento dati per categoria " + sCat);
        }
      });
    },

    _onDataLoaded: function (aRows, sCat) {
      var oDetail = this.getView().getModel("detail");
      var oVm = this.getOwnerComponent().getModel("vm");

      // Hydrate MMCT config from rows
      var result = DataLoaderUtil.hydrateMmctFromRows(aRows, oDetail, oVm, N.getCodAgg);
      this._log("_hydrateMmctFromRows", result);

      // Format multi-value fields
      var mMulti = PostUtil.getMultiFieldsMap(oDetail);
      PostUtil.formatIncomingRowsMultiSeparators(aRows, mMulti);

      // Mark ALL rows as read-only (Screen5 is view-only)
      // Resolve domain keys to display texts (e.g. "BA" -> "Blue Angel")
      var mDomByKey = oVm.getProperty("/domainsByKey") || {};
      var aCfg01 = oDetail.getProperty("/_mmct/s01") || [];
      var aCfg02 = oDetail.getProperty("/_mmct/s02") || [];

      // Build map: fieldName -> domainName for fields that have a domain
      var mFieldDomain = {};
      [aCfg01, aCfg02].forEach(function (arr) {
        (arr || []).forEach(function (f) {
          if (!f || !f.ui || !f.domain) return;
          var sDom = String(f.domain).trim();
          if (sDom && mDomByKey[sDom]) {
            mFieldDomain[String(f.ui).trim()] = sDom;
          }
        });
      });

      aRows.forEach(function (r) {
        if (!r) return;
        r.__readOnly = true;

        // Resolve domain keys to display texts and deduplicate
        Object.keys(mFieldDomain).forEach(function (sField) {
          var v = r[sField];
          if (v == null || v === "") return;
          var sDom = mFieldDomain[sField];
          var mKeys = mDomByKey[sDom] || {};

          if (Array.isArray(v)) {
            // Multi-value array: resolve each key, deduplicate
            var seen = {};
            r[sField] = v.map(function (k) {
              var sk = String(k || "").trim();
              var txt = mKeys[sk] || sk;
              if (seen[txt]) return null;
              seen[txt] = true;
              return txt;
            }).filter(Boolean);
          } else {
            // String: may be semicolon-separated keys
            var sVal = String(v);
            var parts = sVal.split(/[;|]+/).map(function (k) { return k.trim(); }).filter(Boolean);
            if (parts.length > 1) {
              var seen2 = {};
              r[sField] = parts.map(function (k) {
                var txt = mKeys[k] || k;
                if (seen2[txt]) return null;
                seen2[txt] = true;
                return txt;
              }).filter(Boolean).join("; ");
            } else {
              var sk = sVal.trim();
              if (mKeys[sk]) r[sField] = mKeys[sk];
            }
          }
        });
      });

      // Set data
      oDetail.setProperty("/_mmct/cat", sCat);
      oDetail.setProperty("/RowsAll", aRows);
      oDetail.setProperty("/Rows", aRows);
      oDetail.setProperty("/RowsCount", aRows.length);
      oDetail.setProperty("/__loaded", true);

      // Reset filters
      this._inlineFS = { filters: {}, sort: { key: "", desc: false }, sortBtns: {}, filterInputs: {}, headerTitles: {}, headerRows: {}, headerBoxes: {} };
      var oInp = this.byId("inputFilter5");
      if (oInp && oInp.setValue) oInp.setValue("");
      oDetail.setProperty("/__q", "");
      oDetail.setProperty("/__statusFilter", "");

      // Build columns and bind table
      this._bindTable(aRows);
    },

    // ==================== TABLE BINDING ====================
    _bindTable: async function (aRows) {
      var oDetail = this.getView().getModel("detail");
      var oVm = this.getOwnerComponent().getModel("vm");

      // Use all available s01+s02 config fields for columns
      var aCfg01 = oDetail.getProperty("/_mmct/s01") || [];
      var aCfg02 = oDetail.getProperty("/_mmct/s02") || [];

      // ── SummarySort: read raw MMCT fields to get SummarySort per field ──
      // mmctFieldsByCat stores the raw OData objects which have SummarySort property
      var sCat = String(oDetail.getProperty("/_mmct/cat") || "").trim();
      var aRawFields = (oVm.getProperty("/mmctFieldsByCat/" + sCat)) || [];
      var mSummarySort = {};   // UiFieldname (UPPER) -> SummarySort (int)
      (aRawFields || []).forEach(function (f) {
        var ui = String(f.UiFieldname || f.UIFIELDNAME || "").trim().toUpperCase();
        var iSort = parseInt(String(f.SummarySort ?? f.SUMMARYSORT ?? "0").trim(), 10);
        if (ui) mSummarySort[ui] = isNaN(iSort) ? 0 : iSort;
      });
      this._log("SummarySort map", mSummarySort);

      // Merge s01 + s02 with dedup
      var seen = Object.create(null);
      var aCfgAll = [];
      [aCfg01, aCfg02].forEach(function (arr) {
        (arr || []).forEach(function (f) {
          var ui = String(f && f.ui || "").trim();
          if (!ui) return;
          var k = ui.toUpperCase();
          if (seen[k]) return;
          seen[k] = true;
          aCfgAll.push(f);
        });
      });

      // ── SummarySort: order columns by SummarySort (>0 first ascending, 0 at the end) ──
      aCfgAll.sort(function (a, b) {
        var uiA = String(a && a.ui || "").trim().toUpperCase();
        var uiB = String(b && b.ui || "").trim().toUpperCase();
        var sA = mSummarySort[uiA] || 0;
        var sB = mSummarySort[uiB] || 0;
        // Fields with SummarySort > 0 come first, sorted ascending
        if (sA > 0 && sB > 0) return sA - sB;
        if (sA > 0) return -1;
        if (sB > 0) return 1;
        return 0;  // preserve relative order for fields without SummarySort
      });

      // Ensure Stato column exists
      if (!seen["STATO"]) {
        aCfgAll.unshift({ ui: "Stato", label: "Stato", domain: "", required: false });
      }
      // Ensure key fields
      ["Fornitore", "Materiale", "Fibra", "Stagione"].forEach(function (k) {
        if (!seen[k.toUpperCase()]) {
          aCfgAll.push({ ui: k, label: k, domain: "", required: false });
          seen[k.toUpperCase()] = true;
        }
      });

      // Set MDC config
      var aProps = aCfgAll.map(function (f) {
        var name = String(f.ui || "").trim();
        if (name.toUpperCase() === "STATO") name = "Stato";
        return { name: name, label: f.label || name, dataType: "String", domain: f.domain || "", required: !!f.required };
      });
      oVm.setProperty("/mdcCfg/screen5", { modelName: "detail", collectionPath: "/Rows", properties: aProps });
      this._log("mdcCfg/screen5 set", { props: aProps.length });

      // Rebuild columns
      var oTbl = this.byId("mdcTable5");
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

      var self = this;
      setTimeout(function () {
        P13nUtil.forceP13nAllVisible(oTbl, StateUtil, self._log.bind(self), "t300");
        setTimeout(function () { self._applyInlineHeaderFilterSort(oTbl); }, 350);
      }, 300);

      this._log("_bindTable done", { rows: aRows.length, cols: aCfgAll.length });
    },

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

      // Stato column first
      var mP = MdcColumn.getMetadata().getAllProperties();
      var oStatoProps = { width: "70px", header: "Stato", visible: true, dataProperty: "Stato",
        template: this._createStatusCellTemplate("Stato") };
      if (mP.propertyKey) oStatoProps.propertyKey = "Stato";
      oTbl.addColumn(new MdcColumn(oStatoProps));

      // Data columns (read-only) — order is already set by SummarySort in _bindTable
      aCfgUnique.forEach(function (f) {
        var sKey = String(f.ui || "").trim();
        if (!sKey) return;
        var sHeader = f.label || sKey;
        var oColProps = { header: sHeader, visible: true, dataProperty: sKey,
          template: this._createReadOnlyCellTemplate(sKey, f) };
        if (mP.propertyKey) oColProps.propertyKey = sKey;
        oTbl.addColumn(new MdcColumn(oColProps));
      }.bind(this));
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
          new ObjectStatus({ text: "", icon: "sap-icon://circle-task", state: sStateExpr,
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
      try { sVal = (sSrc.data && sSrc.data("status")) || ""; } catch (e) { }
      oDetail.setProperty("/__statusFilter", sVal);
      this._applyClientFilters();
    },
    onGlobalFilter: function (oEvt) {
      var oDetail = this.getView().getModel("detail");
      oDetail.setProperty("/__q", String(oEvt.getParameter("value") || ""));
      this._applyClientFilters();
    },
    _onInlineColFilterLiveChange: function (oEvt) {
      FilterSortUtil.onInlineColFilterLiveChange(oEvt, this._inlineFS, this._applyClientFilters.bind(this));
    },
    _onInlineColSortPress: function (oEvt) {
      FilterSortUtil.onInlineColSortPress(oEvt, this._inlineFS, this._applyClientFilters.bind(this));
    },
    onResetFiltersAndSort: function () {
      FilterSortUtil.resetFiltersAndSort({
        oDetail: this.getView().getModel("detail"), inlineFS: this._inlineFS, inputFilter: this.byId("inputFilter5"),
        table: this.byId("mdcTable5"), applyClientFiltersFn: this._applyClientFilters.bind(this),
        applyInlineHeaderFilterSortFn: this._applyInlineHeaderFilterSort.bind(this),
        setInnerHeaderHeightFn: this._setInnerHeaderHeight.bind(this)
      });
    },

    _setInnerHeaderHeight: function (oMdcTbl) {
      try { MdcTableUtil.setInnerHeaderHeight(oMdcTbl, !!this.getView().getModel("ui").getProperty("/showHeaderFilters")); } catch (e) { }
    },

    _applyInlineHeaderFilterSort: async function (oMdcTbl) {
      this._inlineFS = MdcTableUtil.ensureInlineFS(this._inlineFS);
      return MdcTableUtil.applyInlineHeaderFilterSort(oMdcTbl, {
        view: this.getView(), inlineFS: this._inlineFS,
        applyClientFilters: this._applyClientFilters.bind(this), log: this._log.bind(this)
      });
    },

    // ==================== HEADER BUTTONS ====================
    onToggleHeaderFilters: function () {
      FilterSortUtil.toggleHeaderFilters(this.getView().getModel("ui"), this.byId("mdcTable5"), this._setInnerHeaderHeight.bind(this), this._applyInlineHeaderFilterSort.bind(this));
    },
    onToggleHeaderSort: function () {
      FilterSortUtil.toggleHeaderSort(this.getView().getModel("ui"), this.byId("mdcTable5"), this._applyInlineHeaderFilterSort.bind(this));
    },
    onOpenColumnFilters: function () { this.onToggleHeaderFilters(); },
    onOpenSort: function () { this.onToggleHeaderSort(); },

    // ==================== EXPORT ====================
    onExportExcel: async function () {
      var oDetail = this.getView().getModel("detail");
      if (!oDetail.getProperty("/__loaded")) { MessageToast.show("Nessun dato da esportare"); return; }

      var aRows = oDetail.getProperty("/Rows") || [];
      if (!aRows.length) { MessageToast.show("Nessuna riga da esportare (controlla i filtri)"); return; }

      try {
        BusyIndicator.show(0);

        // Build columns from MMCT config
        var aCfg01 = oDetail.getProperty("/_mmct/s01") || [];
        var aCfg02 = oDetail.getProperty("/_mmct/s02") || [];
        var seen = {};
        var aCols = [];

        // Stato first
        aCols.push({ label: "Stato", property: "StatoText", type: "String" });
        seen["STATO"] = true;
        seen["STATOTEXT"] = true;

        // Key fields
        ["Fornitore", "Materiale", "Fibra", "Stagione"].forEach(function (k) {
          if (!seen[k.toUpperCase()]) {
            aCols.push({ label: k, property: k, type: "String" });
            seen[k.toUpperCase()] = true;
          }
        });

        // Config fields
        [aCfg01, aCfg02].forEach(function (arr) {
          (arr || []).forEach(function (f) {
            var ui = String(f && f.ui || "").trim();
            if (!ui) return;
            var k = ui.toUpperCase();
            if (seen[k]) return;
            seen[k] = true;
            aCols.push({ label: f.label || ui, property: ui, type: "String" });
          });
        });

        // Map rows
        var aData = aRows.map(function (r) {
          var o = {};
          aCols.forEach(function (c) {
            var v = "";
            if (c.property === "StatoText") {
              v = RecordsUtil.statusText(String(r.Stato || r.__status || "ST").trim().toUpperCase());
            } else {
              v = (r && r[c.property] != null) ? r[c.property] : "";
            }
            if (Array.isArray(v)) v = v.join(", ");
            o[c.property] = String(v != null ? v : "");
          });
          return o;
        });

        var EdmType = sap.ui.require("sap/ui/export/library").EdmType;
        var Spreadsheet = sap.ui.require("sap/ui/export/Spreadsheet");
        var oSettings = {
          workbook: {
            columns: aCols.map(function (c) { return { label: c.label, property: c.property, type: EdmType.String }; })
          },
          dataSource: aData,
          fileName: "DatiTabella_" + (oDetail.getProperty("/_mmct/cat") || "export") + ".xlsx"
        };
        var oSheet = new Spreadsheet(oSettings);
        await oSheet.build();
        oSheet.destroy();
        MessageToast.show("Excel esportato");
      } catch (e) {
        console.error("[S5] Export error", e);
        MessageToast.show("Errore export Excel");
      } finally {
        BusyIndicator.hide();
      }
    },
    onPrint: function () { MessageToast.show("Stampa: TODO"); },

    // ==================== NAVIGATION ====================
    _getNavBackFallback: function () {
      return { route: "Screen0", params: {} };
    }
  });
});