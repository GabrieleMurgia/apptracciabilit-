sap.ui.define([
  "apptracciabilita/apptracciabilita/util/common",
  "apptracciabilita/apptracciabilita/util/statusUtil",
  "apptracciabilita/apptracciabilita/util/postUtil"  
], function (Common, StatusUtil, PostUtil) {  
  "use strict";

  var toStableString = Common.toStableString;
  var valToText = Common.valToText;

  return {

    // =========================
    // ROW KEY HELPERS
    // =========================
    rowGuidKey: function (r) {
      var v = r && (r.Guid || r.GUID || r.guidKey || r.GuidKey);
      return toStableString(v);
    },

    rowFibra: function (r) {
      var v = r && (r.Fibra || r.FIBRA);
      return toStableString(v);
    },

    // =========================
    // STATUS TEXT
    // =========================
    statusText: function (sCode) {
      var c = String(sCode || "").trim().toUpperCase();
      var m = {
        ST: "In attesa / Da approvare",
        AP: "Approvato",
        RJ: "Respinto",
        CH: "Modificato"
      };
      return m[c] || c || "";
    },

    // =========================
    // BUILD RECORDS 01 (Screen3)
    // =========================
    buildRecords01: function (aAllRows, opts) {
      var oDetail = opts.oDetail;
      var oVm = opts.oVm;
      var statusTextFn = this.statusText;
      var rowGuidKeyFn = this.rowGuidKey;
      var rowFibraFn = this.rowFibra;

      var aCfg01 = oDetail.getProperty("/_mmct/s01") || [];
      var aCols01 = aCfg01.map(function (x) { return x.ui; }).filter(Boolean);

      var mIsMulti = {};
      (aCfg01 || []).forEach(function (f) {
        if (f && f.ui && f.multiple) mIsMulti[f.ui] = true;
      });

      function toArray(v) {
        if (Array.isArray(v)) return v;
        var s = String(v || "").trim();
        if (!s) return [];
        return s.split(/[;|]+/).map(function (x) { return x.trim(); }).filter(Boolean);
      }

      var sRole = (oVm && oVm.getProperty("/userType")) || "";
      sRole = String(sRole || "").trim().toUpperCase();

      var m = {};
      var a = [];

      (aAllRows || []).forEach(function (r) {
       /*  if (Common.isTemplateRow(r)) return; */
       if (!opts.includeTemplates && Common.isTemplateRow(r)) return;


        var sGuidKey = rowGuidKeyFn(r);
        var sFibra = rowFibraFn(r);
        var sKey = sGuidKey;

        var stRow = StatusUtil.normStatoRow(r, oVm);

        var oRec = m[sKey];

        if (!oRec) {
          oRec = {
            idx: a.length,
            guidKey: sGuidKey,
            Fibra: sFibra,
            CodAgg: (r && (r.CodAgg || r.CODAGG)) || "",   // ← propaga CodAgg per validazione saveUtil

            Stato: stRow,
            StatoText: statusTextFn(stRow),
            __status: stRow,
            __allStatuses: [stRow],

            __canEdit: StatusUtil.canEdit(sRole, stRow),
            __canApprove: StatusUtil.canApprove(sRole, stRow),
            __canReject: StatusUtil.canReject(sRole, stRow),

            __readOnly: !StatusUtil.canEdit(sRole, stRow)
          };

          aCols01.forEach(function (c) {
            var v = (r && r[c] !== undefined) ? r[c] : "";
            oRec[c] = mIsMulti[c] ? toArray(v) : v;
          });

          m[sKey] = oRec;
          a.push(oRec);

        } else {
          oRec.__allStatuses.push(stRow);
        }
      });

      // Recompute aggregate status for each record from all collected per-row statuses.
      // Logic: ALL must be AP for parent to be AP; any RJ → RJ; any ST → ST; else CH.
      a.forEach(function (oRec) {
        var aS = oRec.__allStatuses || [];
        var sAgg;
        if (aS.length && aS.every(function (s) { return s === "AP"; })) {
          sAgg = "AP";
        } else if (aS.some(function (s) { return s === "RJ"; })) {
          sAgg = "RJ";
        } else if (aS.some(function (s) { return s === "CH"; })) {
          sAgg = "CH";
        } else {
          sAgg = "ST";
        }
        oRec.__status = sAgg;
        oRec.Stato = sAgg;
        oRec.StatoText = statusTextFn(sAgg);
        oRec.__canEdit = StatusUtil.canEdit(sRole, sAgg);
        oRec.__canApprove = StatusUtil.canApprove(sRole, sAgg);
        oRec.__canReject = StatusUtil.canReject(sRole, sAgg);
        oRec.__readOnly = !oRec.__canEdit;
        delete oRec.__allStatuses;
      });

      return a;
    },

    // =========================
    // COMPUTE OPEN ODA FROM ROWS
    // =========================
    computeOpenOdaFromRows: function (aRows) {
      var hasSignalProp = false;

      var bHasOpen = (aRows || []).some(function (r) {
        if (!r) return false;

        if (r.Open !== undefined || r.OpenPo !== undefined || r.OdaAperti !== undefined) {
          hasSignalProp = true;
        }

        var v = r.Open;
        if (v === true || v === 1) return true;

        v = String(v == null ? "" : v).trim().toUpperCase();
        if (v === "X" || v === "1" || v === "TRUE") return true;

        var n = Number(r.OpenPo || r.OdaAperti || r.Aperti || 0);
        return n > 0;
      });

      return { hasSignalProp: hasSignalProp, flag: bHasOpen ? "X" : "" };
    },

    // =========================
    // REFRESH HEADER 3 FIELDS
    // =========================
    refreshHeader3Fields: function (oDetail) {
      var aHdr = oDetail.getProperty("/_mmct/hdr3") || [];
      var r0 = oDetail.getProperty("/_mmct/raw0") || {};

      var a = (aHdr || [])
        .slice()
        .sort(function (a, b) { return (a.order ?? 9999) - (b.order ?? 9999); })
        .map(function (f) {
          var kRaw = String(f.ui || "").trim();
          var k = (kRaw.toUpperCase() === "STATO") ? "Stato" : kRaw;

          return {
            key: k,
            label: f.label || kRaw || k,
            value: valToText(r0[k])
          };
        });

      var seen = Object.create(null);
      a = a.filter(function (x) {
        var k = String(x && x.key || "").trim().toUpperCase();
        if (!k) return false;
        if (k === "STATO") k = "STATO";
        if (seen[k]) return false;
        seen[k] = true;
        return true;
      });

      oDetail.setProperty("/Header3Fields", a);
    },

    // =========================
    // HAS UNSAVED CHANGES
    // =========================
    hasUnsavedChanges: function (oDetail, snapshotRecords) {
      var aCurrent = oDetail.getProperty("/RecordsAll") || [];
      var aSnapshot = snapshotRecords || [];

      var normalizeObject = function (obj) {
        var cleanEntries = Object.entries(obj).map(function (entry) {
          var key = entry[0];
          var value = entry[1];
          if (Array.isArray(value)) {
            return [key, [].concat(new Set(value)).sort()];
          }
          return [key, value];
        });
        return Object.fromEntries(cleanEntries);
      };

      aSnapshot = aSnapshot.map(normalizeObject);
      aCurrent = aCurrent.map(normalizeObject);

      if (!aSnapshot || !aSnapshot.length) return false;
      if (aCurrent.length !== aSnapshot.length) return true;

      return aCurrent.some(function (rCurr, i) {
        var rSnap = aSnapshot[i];
        if (!rSnap) return true;

        return Object.keys(rCurr).some(function (k) {
          if (k.indexOf("__") === 0) return false;
          if (k === "idx" || k === "guidKey" || k === "StatoText") return false;

          var vCurr = rCurr[k];
          var vSnap = rSnap[k];

          if (Array.isArray(vCurr) && Array.isArray(vSnap)) {
            if (vCurr.length !== vSnap.length) return true;
            return vCurr.some(function (v, j) {
              if (v !== null && typeof v === "object") {
                return JSON.stringify(v) !== JSON.stringify(vSnap[j]);
              }
              return v !== vSnap[j];
            });
          }

          return vCurr !== vSnap;
        });
      });
    },

    // =========================
    // TO ARRAY MULTI
    // =========================
    toArrayMulti: function (v) {
      if (Array.isArray(v)) return v.slice();
      var s = String(v || "").trim();
      if (!s) return [];
      return s.split(/[;|]+/).map(function (x) { return x.trim(); }).filter(Boolean);
    },

      _bindRecords: async function (aRecords) {
      var oDetail = this._getODetail();
      var a = aRecords || [];

      oDetail.setProperty("/RecordsAll", a);
      oDetail.setProperty("/Records", a);
      oDetail.setProperty("/RecordsCount", a.length);

      var oVm = this.getOwnerComponent().getModel("vm");
      var sRole = String((oVm && oVm.getProperty("/userType")) || "").trim().toUpperCase();

      var aSt = a.map(function (r) {
        return String((r && (r.__status || r.Stato)) || "ST").trim().toUpperCase();
      });

      var allAP = aSt.length > 0 && aSt.every(function (s) { return s === "AP"; });
      var anyRJ = aSt.some(function (s) { return s === "RJ"; });
      var anyCH = aSt.some(function (s) { return s === "CH"; });

      var sAgg = allAP ? "AP" : (anyRJ ? "RJ" : (anyCH ? "CH" : "ST"));

      oDetail.setProperty("/__status", sAgg);
      oDetail.setProperty("/__canAddRow", StatusUtil.canAddRow(sRole, sAgg));
      oDetail.setProperty("/__role", sRole);

      this._refreshHeader3Fields();
      this._snapshotRecords = deepClone(a);

      var oTbl = this.byId("mdcTable3");
      var aCfg01Table = oDetail.getProperty("/_mmct/s01Table") || [];
      this._ensureMdcCfgScreen3(aCfg01Table);
      this._resetInlineHeaderControls();
      await this._rebuildColumnsHard(oTbl, aCfg01Table);

      if (oTbl && oTbl.initialized) await oTbl.initialized();
      if (oTbl) oTbl.setModel(oDetail, "detail");

      await this._applyInlineHeaderFilterSort(oTbl);

      this._applyClientFilters();

      if (oTbl && typeof oTbl.rebind === "function") oTbl.rebind();

      await this._forceP13nAllVisible(oTbl, "t0");
      await this._applyInlineHeaderFilterSort(oTbl);

      setTimeout(function () {
        this._forceP13nAllVisible(oTbl, "t300");
        setTimeout(function () { this._applyInlineHeaderFilterSort(oTbl); }.bind(this), 350);
      }.bind(this), 300);

      this._logTable("TABLE STATE @ after _bindRecords");
      this._ensurePostErrorRowHooks(oTbl);
    },

    // =========================
    // PERCENTAGE VALIDATION
    // =========================

    /** Known percentage field names. Add new ones here if needed. */
    PERC_FIELDS: ["QtaFibra"],

    /**
     * Find percentage field names from MMCT config (s01 + s02).
     */
    findPercFields: function (oDetail) {
      if (!oDetail) return [];
      var self = this;
      var aResult = [];
      var mSeen = {};
      var aConfigs = [
        oDetail.getProperty("/_mmct/s01") || [],
        oDetail.getProperty("/_mmct/s02") || []
      ];
      aConfigs.forEach(function (aCfg) {
        (aCfg || []).forEach(function (f) {
          if (!f || !f.ui) return;
          var sUi = String(f.ui).trim();
          if (mSeen[sUi]) return;
          if (self.PERC_FIELDS.indexOf(sUi) >= 0) {
            mSeen[sUi] = true; aResult.push(sUi); return;
          }
          var sLabel = String(f.label || "").toLowerCase();
          if (sLabel.indexOf("quantit") >= 0 && sLabel.indexOf("fibra") >= 0) {
            mSeen[sUi] = true; aResult.push(sUi);
          }
        });
      });
      return aResult;
    },

    /**
     * Sum a percentage field across all rows.
     */
    computePercSum: function (aRows, sField) {
      var sum = 0;
      (aRows || []).forEach(function (r) {
        if (!r) return;
        var n = parseFloat(r[sField]);
        if (!isNaN(n)) sum += n;
      });
      return Math.round(sum * 100) / 100;
    },

    /**
     * Validate all percentage fields. Returns { ok, errors }.
     */
    validatePercentages: function (oDetail, sRowsPath) {
      if (!oDetail) return { ok: true, errors: [] };
      var aPercFields = this.findPercFields(oDetail);
      if (!aPercFields.length) return { ok: true, errors: [] };
      var aRows = sRowsPath
        ? (oDetail.getProperty(sRowsPath) || [])
        : (oDetail.getProperty("/RowsAll") || oDetail.getProperty("/RecordsAll") || []);
      var self = this;
      var errors = [];
      aPercFields.forEach(function (sField) {
        var sum = self.computePercSum(aRows, sField);
        if (sum > 100) errors.push({ field: sField, sum: sum });
      });
      return { ok: errors.length === 0, errors: errors };
    },

    /**
     * Validate before save: show error dialog if sum > 100%. Returns true if OK.
     */
    validatePercBeforeSave: function (oDetail, sRowsPath) {
      var result = this.validatePercentages(oDetail, sRowsPath);
      if (!result.ok) {
        var lines = result.errors.map(function (e) { return "- " + e.field + ": " + e.sum + "%"; });
        sap.m.MessageBox.error(
          "La somma percentuale supera il 100%.\nCorreggi i valori prima di salvare.\n\n" + lines.join("\n"),
          { title: "Errore Validazione" }
        );
        return false;
      }
      return true;
    },

    /**
     * Apply valueState Error/None to percentage cells in the table.
     */
    applyPercValueStates: function (oMdcTable, oDetail, sRowsPath) {
      if (!oMdcTable || !oDetail) return;
      var aPercFields = this.findPercFields(oDetail);
      if (!aPercFields.length) return;
      var aRows = sRowsPath
        ? (oDetail.getProperty(sRowsPath) || [])
        : (oDetail.getProperty("/RowsAll") || oDetail.getProperty("/RecordsAll") || []);
      var self = this;
      var mExceeded = {};
      aPercFields.forEach(function (sField) { mExceeded[sField] = self.computePercSum(aRows, sField) > 100; });

      var oInner = null;
      try {
        if (typeof oMdcTable.getTable === "function") oInner = oMdcTable.getTable();
        if (!oInner && typeof oMdcTable.getContent === "function") oInner = oMdcTable.getContent();
        if (!oInner && oMdcTable._oTable) oInner = oMdcTable._oTable;
      } catch (e) {}
      if (!oInner) return;

      var aItems = [];
      if (typeof oInner.getRows === "function") aItems = oInner.getRows() || [];
      else if (typeof oInner.getItems === "function") aItems = oInner.getItems() || [];

      aItems.forEach(function (oRow) {
        var aCells = (typeof oRow.getCells === "function") ? (oRow.getCells() || []) : [];
        aCells.forEach(function (oCell) {
          var aControls = [oCell];
          if (typeof oCell.getItems === "function") aControls = oCell.getItems() || [oCell];
          aControls.forEach(function (oCtrl) {
            if (!oCtrl || typeof oCtrl.setValueState !== "function") return;
            var sBindPath = "";
            try {
              var oBinding = oCtrl.getBinding("value") || oCtrl.getBinding("selectedKeys") || oCtrl.getBinding("selectedKey");
              if (oBinding && oBinding.getPath) sBindPath = String(oBinding.getPath() || "");
            } catch (e) {}
            if (!sBindPath) return;

            var bExceeded = false, sMatchedField = "";
            aPercFields.forEach(function (sField) {
              if (sBindPath === sField || sBindPath.indexOf("/" + sField) >= 0) {
                if (mExceeded[sField]) { bExceeded = true; sMatchedField = sField; }
              }
            });

            if (bExceeded) {
              oCtrl.setValueState("Error");
              oCtrl.setValueStateText("La somma supera il 100% (" + self.computePercSum(aRows, sMatchedField) + "%)");
              try { oCtrl.data("__percError", "true"); } catch (e) {}
            } else {
              try {
                if (oCtrl.data("__percError") === "true") {
                  oCtrl.setValueState("None"); oCtrl.setValueStateText("");
                  oCtrl.data("__percError", "false");
                }
              } catch (e) {}
            }
          });
        });
      });
    },

    /**
     * Full check: validate + apply valueStates + optional toast.
     */
    checkPercAndApply: function (oMdcTable, oDetail, opts) {
      opts = opts || {};
      var result = this.validatePercentages(oDetail, opts.rowsPath);
      if (oDetail) {
        oDetail.setProperty("/__percExceeded", !result.ok);
        if (result.errors.length) oDetail.setProperty("/__percSum", result.errors[0].sum);
      }
      if (oMdcTable) {
        var self = this;
        setTimeout(function () { self.applyPercValueStates(oMdcTable, oDetail, opts.rowsPath); }, 150);
      }
      if (!result.ok && opts.showToast !== false) {
        var parts = result.errors.map(function (e) { return "\"" + e.field + "\": " + e.sum + "%"; });
        sap.m.MessageToast.show("Attenzione: somma percentuale supera 100% (" + parts.join(", ") + ")", { duration: 3000, width: "25em" });
      }
      return result;
    },

  };
});