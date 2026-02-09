sap.ui.define([
  "apptracciabilita/apptracciabilita/util/common",
  "apptracciabilita/apptracciabilita/util/statusUtil",
  "apptracciabilita/apptracciabilita/util/postUtil"  // <-- AGGIUNTO
], function (Common, StatusUtil, PostUtil) {  // <-- AGGIUNTO PostUtil
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
        return s.split(/[;,|]+/).map(function (x) { return x.trim(); }).filter(Boolean);
      }

      var sRole = (oVm && oVm.getProperty("/userType")) || "";
      sRole = String(sRole || "").trim().toUpperCase();

      var m = {};
      var a = [];

      (aAllRows || []).forEach(function (r) {
        // USA PostUtil.isTemplateRow CORRETTAMENTE
        if (PostUtil.isTemplateRow(r)) return;

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

            Stato: stRow,
            StatoText: statusTextFn(stRow),
            __status: stRow,

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
          var merged = StatusUtil.mergeStatus(oRec.__status, stRow);
          if (merged !== oRec.__status) {
            oRec.__status = merged;
            oRec.Stato = merged;
            oRec.StatoText = statusTextFn(merged);

            oRec.__canEdit = StatusUtil.canEdit(sRole, merged);
            oRec.__canApprove = StatusUtil.canApprove(sRole, merged);
            oRec.__canReject = StatusUtil.canReject(sRole, merged);

            oRec.__readOnly = !oRec.__canEdit;
          }
        }
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
            return vCurr.some(function (v, j) { return v !== vSnap[j]; });
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
      return s.split(/[;,|]+/).map(function (x) { return x.trim(); }).filter(Boolean);
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

  };
});