sap.ui.define([
  "sap/m/Input",
  "sap/m/ComboBox",
  "sap/m/MultiComboBox",
  "sap/m/Text",
  "sap/m/Button",
  "sap/m/HBox",
  "sap/m/VBox",
  "sap/ui/core/Item",
  "apptracciabilita/apptracciabilita/util/normalize",
  "apptracciabilita/apptracciabilita/util/mdcTableUtil"
], function (Input, ComboBox, MultiComboBox, Text, Button, HBox, VBox, Item, N, MdcTableUtil) {
  "use strict";

  var S4Filter = {

    // ==================== APPLY FILTERS + SORT ====================
    applyFiltersAndSort: function (oDetail, state) {
      if (!oDetail) return;
      var aAll = oDetail.getProperty("/RowsAll") || [];
      var a = Array.isArray(aAll) ? aAll.slice() : [];

      // GLOBAL
      var q = String(state.globalQuery || "").trim().toUpperCase();
      if (q) {
        a = a.filter(function (r) {
          return Object.keys(r || {}).some(function (k) {
            if (k === "__metadata" || k === "AllData") return false;
            var v = r[k];
            if (v === null || v === undefined) return false;
            return N.valToText(v).toUpperCase().indexOf(q) >= 0;
          });
        });
      }

      // COLUMN FILTERS
      var m = state.colFilters || {};
      var keys = Object.keys(m);
      if (keys.length) {
        a = a.filter(function (r) {
          return keys.every(function (k) {
            var f = m[k];
            if (!f) return true;
            var rv = r ? r[k] : undefined;

            if (f.type === "text") {
              var sNeed = String(f.value || "").trim().toUpperCase();
              if (!sNeed) return true;
              return N.valToText(rv).toUpperCase().indexOf(sNeed) >= 0;
            }
            if (f.type === "key") {
              var sKey = String(f.value || "").trim();
              if (!sKey) return true;
              if (Array.isArray(rv)) return rv.indexOf(sKey) >= 0;
              return String(rv || "").trim() === sKey;
            }
            if (f.type === "keys") {
              var aNeed = Array.isArray(f.value) ? f.value : [];
              if (!aNeed.length) return true;
              if (Array.isArray(rv)) return aNeed.some(function (x) { return rv.indexOf(x) >= 0; });
              return aNeed.indexOf(String(rv || "").trim()) >= 0;
            }
            return true;
          });
        });
      }

      // SORT
      var st = state.sortState;
      if (st && st.key) {
        var key = st.key, desc = !!st.desc;
        a.sort(function (x, y) {
          var vx = (x && x[key] != null) ? x[key] : "";
          var vy = (y && y[key] != null) ? y[key] : "";
          if (Array.isArray(vx)) vx = vx.join(", ");
          if (Array.isArray(vy)) vy = vy.join(", ");
          var cmp = String(vx).localeCompare(String(vy), undefined, { numeric: true, sensitivity: "base" });
          return desc ? -cmp : cmp;
        });
      }

      oDetail.setProperty("/Rows", a);
      oDetail.setProperty("/RowsCount", a.length);
    },

    // ==================== HEADER SORT ====================
    refreshHeaderSortIcons: function (hdrSortBtns, sortState) {
      var st = sortState || { key: "", desc: false };
      var m = hdrSortBtns || {};
      Object.keys(m).forEach(function (k) {
        var b = m[k];
        if (!b || !b.setIcon) return;
        if (!st.key || st.key !== k) b.setIcon("sap-icon://sort");
        else b.setIcon(st.desc ? "sap-icon://sort-descending" : "sap-icon://sort-ascending");
      });
    },

    onHeaderSortPress: function (oEvt, state, hdrSortBtns, applyFn) {
      var oBtn = oEvt.getSource();
      var sField = oBtn && oBtn.data && oBtn.data("field");
      if (!sField) return;

      if (state.sortState && state.sortState.key === sField) {
        state.sortState.desc = !state.sortState.desc;
      } else {
        state.sortState = { key: sField, desc: false };
      }
      S4Filter.refreshHeaderSortIcons(hdrSortBtns, state.sortState);
      applyFn();
    },

    // ==================== HEADER FILTER CTRL CREATION ====================
    createHeaderFilterCtrl: function (sKey, fMeta, domainHasValuesFn, state, applyFn, dbgFn) {
      var sDomain = String((fMeta && fMeta.domain) || "").trim();
      var bHasDomain = !!sDomain && domainHasValuesFn(sDomain);
      var bMultiple = !!(fMeta && fMeta.multiple);
      var sVisibleBind = "{ui>/showHeaderFilters}";
      var oCtrl;

      if (bHasDomain) {
        if (bMultiple) {
          oCtrl = new MultiComboBox({
            width: "100%", visible: sVisibleBind,
            showSecondaryValues: true, placeholder: "filtra...",
            items: {
              path: "vm>/domainsByName/" + sDomain,
              template: new sap.ui.core.ListItem({ key: "{vm>key}", text: "{vm>key}", additionalText: "{vm>text}" })
            }
          });
          oCtrl.attachSelectionFinish(function () {
            var a = oCtrl.getSelectedKeys ? oCtrl.getSelectedKeys() : [];
            if (dbgFn) dbgFn("HDR selectionFinish", { key: sKey, selected: a });
            if (Array.isArray(a) && a.length) state.colFilters[sKey] = { type: "keys", value: a.slice() };
            else delete state.colFilters[sKey];
            applyFn();
          });
        } else {
          oCtrl = new ComboBox({
            width: "100%", visible: sVisibleBind, placeholder: "filtra...",
            selectionChange: function () {}
          });
          oCtrl.bindAggregation("items", {
            path: "vm>/domainsByName/" + sDomain,
            template: new Item({ key: "{vm>key}", text: "{vm>text}" })
          });
          oCtrl.attachChange(function () {
            var sk = String(oCtrl.getSelectedKey() || "").trim();
            if (dbgFn) dbgFn("HDR change", { key: sKey, selectedKey: sk });
            if (sk) state.colFilters[sKey] = { type: "key", value: sk };
            else delete state.colFilters[sKey];
            applyFn();
          });
        }
      } else {
        oCtrl = new Input({ width: "100%", visible: sVisibleBind, placeholder: "contiene..." });
        oCtrl.attachLiveChange(function (evt) {
          var v = String(evt.getParameter("value") || "").trim();
          if (dbgFn) dbgFn("HDR liveChange", { key: sKey, value: v });
          if (v) state.colFilters[sKey] = { type: "text", value: v };
          else delete state.colFilters[sKey];
          applyFn();
        });
      }

      try { oCtrl.data("hdrFilterKey", sKey); } catch (e) { }
      return oCtrl;
    },

    // ==================== ENSURE HEADER BOX ====================
    ensureHeaderBoxForKey: function (sKey, fMeta, hdrFilter, hdrSortBtns, opts) {
      if (!hdrFilter) hdrFilter = { boxesByKey: {}, seenLast: {} };
      var p = hdrFilter.boxesByKey[sKey];
      var sHeader = (fMeta && (fMeta.label || fMeta.ui)) ? String(fMeta.label || fMeta.ui) : String(sKey);
      if (fMeta && fMeta.required) sHeader += " *";

      if (!p || !p.box || p.box.bIsDestroyed) {
        var oLbl = new Text({ text: sHeader, wrapping: false, maxLines: 1, width: "100%", tooltip: sHeader });

        var oSortBtn = hdrSortBtns[sKey];
        if (oSortBtn && (oSortBtn.bIsDestroyed || (oSortBtn.isDestroyed && oSortBtn.isDestroyed()))) {
          delete hdrSortBtns[sKey]; oSortBtn = null;
        }
        if (!oSortBtn) {
          oSortBtn = new Button({
            type: "Transparent", icon: "sap-icon://sort",
            visible: "{ui>/showHeaderSort}",
            press: opts.onSortPressFn
          });
          oSortBtn.data("field", sKey);
          hdrSortBtns[sKey] = oSortBtn;
        } else {
          if (oSortBtn.bindProperty) oSortBtn.bindProperty("visible", "ui>/showHeaderSort");
        }

        var oTop = new HBox({ justifyContent: "SpaceBetween", alignItems: "Center", items: [oLbl, oSortBtn] });
        var oCtrl = S4Filter.createHeaderFilterCtrl(sKey, fMeta, opts.domainHasValuesFn, opts.state, opts.applyFn, opts.dbgFn);
        var oBox = new VBox({ width: "100%", renderType: "Bare", items: [oTop, oCtrl] });

        hdrFilter.boxesByKey[sKey] = { box: oBox, lbl: oLbl, ctrl: oCtrl, sortBtn: oSortBtn };
      } else {
        p.lbl.setText(sHeader);
      }

      return hdrFilter.boxesByKey[sKey];
    },

    // ==================== INJECT HEADER FILTERS ====================
    injectHeaderFilters: function (reason, opts) {
      var oMdc = opts.mdcTable;
      if (!oMdc) return;

      var tryDo = function (attempt) {
        var oInner = MdcTableUtil.getInnerTableFromMdc(oMdc);
        if (!oInner || typeof oInner.getColumns !== "function") return false;

        var aInnerCols = oInner.getColumns() || [];
        if (!aInnerCols.length) return false;

        var mCfg = opts.getCfg02MapFn();
        var seen = {};
        var okKeys = 0;
        var aMdcCols = (oMdc.getColumns && oMdc.getColumns()) || [];
        var bCanUseIndexMap = Array.isArray(aMdcCols) && aMdcCols.length === aInnerCols.length;

        aInnerCols.forEach(function (c, i) {
          if (!c) return;
          var sKey = S4Filter._normKeyFromInnerCol(c);

          if (!sKey && bCanUseIndexMap && aMdcCols[i]) {
            var mdcCol = aMdcCols[i];
            sKey = (mdcCol.getDataProperty && mdcCol.getDataProperty()) ||
                   (mdcCol.getPropertyKey && mdcCol.getPropertyKey()) || "";
            sKey = String(sKey || "").trim();
          }
          if (!sKey) return;

          okKeys++;
          seen[sKey] = true;

          var fMeta = mCfg[sKey] || { ui: sKey, label: sKey, domain: "", required: false, multiple: false };
          var pack = S4Filter.ensureHeaderBoxForKey(sKey, fMeta, opts.hdrFilter, opts.hdrSortBtns, opts);

          try {
            if (typeof c.setLabel === "function") c.setLabel(pack.box);
            else if (typeof c.setHeader === "function") c.setHeader(pack.box);
          } catch (e) { }
        });

        if (!okKeys) return false;

        // cleanup orphaned
        var boxes = (opts.hdrFilter && opts.hdrFilter.boxesByKey) || {};
        Object.keys(boxes).forEach(function (k) {
          if (!seen[k]) {
            try { if (boxes[k] && boxes[k].box) boxes[k].box.destroy(); } catch (e) { }
            delete boxes[k];
          }
        });

        var oUi = opts.uiModel;
        var bShow = !!(oUi && oUi.getProperty("/showHeaderFilters"));
        MdcTableUtil.setInnerHeaderHeight(oInner, bShow);

        S4Filter.syncHeaderFilterCtrlsFromState(false, opts.state.colFilters, opts.hdrFilter);
        S4Filter.refreshHeaderSortIcons(opts.hdrSortBtns, opts.state.sortState);
        return true;
      };

      var doLater = function (attempt) {
        var ok = tryDo(attempt);
        if (!ok && attempt < 6) setTimeout(function () { doLater(attempt + 1); }, 150);
      };

      if (oMdc.initialized) oMdc.initialized().then(function () { doLater(0); });
      else doLater(0);
    },

    // ==================== SYNC CTRLS FROM STATE ====================
    syncHeaderFilterCtrlsFromState: function (bClear, colFilters, hdrFilter) {
      var m = bClear ? {} : (colFilters || {});
      var boxes = (hdrFilter && hdrFilter.boxesByKey) || {};

      Object.keys(boxes).forEach(function (k) {
        var p = boxes[k];
        if (!p || !p.ctrl) return;
        var st = m[k];

        if (p.ctrl instanceof Input) {
          p.ctrl.setValue(st && st.type === "text" ? String(st.value || "") : "");
        } else if (p.ctrl instanceof ComboBox) {
          p.ctrl.setSelectedKey(st && st.type === "key" ? String(st.value || "") : "");
        } else if (p.ctrl instanceof MultiComboBox) {
          p.ctrl.setSelectedKeys(st && st.type === "keys" && Array.isArray(st.value) ? st.value : []);
        }
      });
    },

    // ==================== RESET ====================
    resetFiltersAndSort: function (state, hdrFilter, hdrSortBtns, opts) {
      state.globalQuery = "";
      state.colFilters = {};
      state.sortState = null;
      S4Filter.refreshHeaderSortIcons(hdrSortBtns, null);

      if (opts.inputFilter && opts.inputFilter.setValue) opts.inputFilter.setValue("");
      S4Filter.syncHeaderFilterCtrlsFromState(true, {}, hdrFilter);

      opts.applyFn();
      if (opts.table) opts.forceP13nFn(opts.table, "reset");
    },

    resetHeaderCaches: function (hdrFilter, hdrSortBtns) {
      try {
        if (hdrFilter && hdrFilter.boxesByKey) {
          Object.keys(hdrFilter.boxesByKey).forEach(function (k) {
            var p = hdrFilter.boxesByKey[k];
            try { if (p && p.box && !p.box.bIsDestroyed) p.box.destroy(); } catch (e) { }
          });
        }
      } catch (e) { }
      // caller must reassign: this._hdrFilter = { boxesByKey: {}, seenLast: {} };
      // caller must reassign: this._hdrSortBtns = {};
    },

    // ==================== HELPERS ====================
    _normKeyFromInnerCol: function (oInnerCol) {
      var k = "";
      try {
        if (oInnerCol && typeof oInnerCol.getFilterProperty === "function") k = oInnerCol.getFilterProperty() || "";
        if (!k && oInnerCol && typeof oInnerCol.getSortProperty === "function") k = oInnerCol.getSortProperty() || "";
      } catch (e) { }
      k = String(k || "").trim();
      if (k.indexOf(">") >= 0) k = k.split(">").pop();
      return String(k || "").trim();
    },

    dedupeCfgByUi: function (aCfg, opts) {
      opts = opts || {};
      var ignoreCase = opts.ignoreCase !== false;
      var skip = opts.skip || {};
      var seen = Object.create(null);
      return (aCfg || []).filter(function (f) {
        var ui = String(f && f.ui || "").trim();
        if (!ui) return false;
        var k = ignoreCase ? ui.toUpperCase() : ui;
        if (skip[k]) return false;
        if (seen[k]) return false;
        seen[k] = true;
        return true;
      });
    }
  };

  return S4Filter;
});