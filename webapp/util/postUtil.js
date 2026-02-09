sap.ui.define([
  "apptracciabilita/apptracciabilita/util/common"
], function (Common) {
  "use strict";

  var deepClone = Common.deepClone;

  return {

    // =========================
    // NORMALIZZAZIONI
    // =========================
    normEsito: function (v) {
      return String(v == null ? "" : v).trim().toUpperCase();
    },

    normMsg: function (o) {
      var m = (o && (o.Message != null ? o.Message : o.message)) || "";
      return String(m == null ? "" : m).trim();
    },

    normalizeVendor10: function (v) {
      var s = String(v || "").trim();
      if (/^\d+$/.test(s) && s.length < 10) s = ("0000000000" + s).slice(-10);
      return s;
    },

    // =========================
    // LETTURA ERRORI ODATA
    // =========================
    readODataError: function (oError) {
      try {
        var s = oError && (oError.responseText || oError.response && oError.response.body);
        if (!s) return "";
        var j = JSON.parse(s);
        return j && j.error && j.error.message && (j.error.message.value || j.error.message) || "";
      } catch (e) {
        return "";
      }
    },

    // =========================
    // EXTRACT POST RESPONSE
    // =========================
    extractPostResponseLines: function (oData) {
      if (!oData) return [];
      if (oData.PostDataCollection && Array.isArray(oData.PostDataCollection.results)) {
        return oData.PostDataCollection.results;
      }
      if (Array.isArray(oData.PostDataCollection)) return oData.PostDataCollection;
      return [];
    },

    // =========================
    // UUID GENERATION
    // =========================
    uuidv4: function () {
      var bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      var bin = "";
      for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin);
    },

    genGuidNew: function () {
      var base = "";

      if (typeof crypto !== "undefined" && crypto.randomUUID) {
        base = crypto.randomUUID().replace(/-/g, "");
      } else if (typeof crypto !== "undefined" && crypto.getRandomValues) {
        var a = new Uint8Array(16);
        crypto.getRandomValues(a);
        base = Array.prototype.map.call(a, function (b) {
          return b.toString(16).padStart(2, "0");
        }).join("");
      } else {
        base = (Date.now().toString(16) + Math.random().toString(16).slice(2)).replace(/\./g, "");
      }

      return base + "-new";
    },

    // =========================
    // MULTI-FIELD HELPERS
    // =========================
    getMultiFieldsMap: function (oDetail) {
      var a01 = (oDetail && oDetail.getProperty("/_mmct/s01")) || [];
      var a02 = (oDetail && oDetail.getProperty("/_mmct/s02")) || [];

      var m = {};
      [a01, a02].forEach(function (arr) {
        (arr || []).forEach(function (f) {
          if (!f || !f.ui || !f.multiple) return;
          var k = String(f.ui).trim();
          if (k.toUpperCase() === "STATO") k = "Stato";
          m[k] = true;
        });
      });

      return m;
    },

    normalizeMultiString: function (v, sSepOut) {
      if (v == null) return v;

      if (Array.isArray(v)) {
        return v
          .map(function (x) { return String(x || "").trim(); })
          .filter(Boolean)
          .join(sSepOut);
      }

      var s = String(v || "").trim();
      if (!s) return "";

      if (s.indexOf(";") < 0 && s.indexOf("|") < 0) return s;

      return s
        .split(/[;|]+/)
        .map(function (x) { return String(x || "").trim(); })
        .filter(Boolean)
        .join(sSepOut);
    },

    formatIncomingRowsMultiSeparators: function (aRows, mMulti) {
      var aKeys = Object.keys(mMulti || {});
      if (!aKeys.length) return;

      var self = this;
      (aRows || []).forEach(function (r) {
        if (!r) return;

        aKeys.forEach(function (k) {
          var v = r[k];
          if (typeof v === "string" && v.indexOf("|") >= 0) {
            r[k] = self.normalizeMultiString(v, ";");
          }
        });
      });
    },

    // =========================
    // CODAGG HELPERS
    // =========================
    getCodAgg: function (o) {
      return String(
        o && (o.CodAgg != null ? o.CodAgg : (o.CODAGG != null ? o.CODAGG : ""))
      ).trim().toUpperCase();
    },

    isBaseCodAgg: function (o) {
      var ca = this.getCodAgg(o);
      return ca === "" || ca === "N";
    },

    isTemplateRow: function (o) {
      return this.getCodAgg(o) === "N";
    },

    // =========================
    // VALIDATION
    // =========================
    isEmptyRequiredValue: function (v) {
      if (v == null) return true;
      if (Array.isArray(v)) return v.length === 0;
      if (typeof v === "string") return v.trim() === "";
      return false;
    },

    getRequiredMapFromMmct: function (oDetail) {
      var a01 = (oDetail && oDetail.getProperty("/_mmct/s01")) || [];
      var a02 = (oDetail && oDetail.getProperty("/_mmct/s02")) || [];

      var req01 = {};
      var req02 = {};

      (a01 || []).forEach(function (f) {
        if (f && f.ui && f.required) {
          var k = String(f.ui).trim();
          if (k.toUpperCase() === "STATO") k = "Stato";
          req01[k] = f;
        }
      });

      (a02 || []).forEach(function (f) {
        if (f && f.ui && f.required) {
          var k = String(f.ui).trim();
          if (k.toUpperCase() === "STATO") k = "Stato";
          req02[k] = f;
        }
      });

      return { req01: req01, req02: req02 };
    },

    // =========================
    // STASH DELETE FOR POST
    // =========================
    stashDeleteForPostFromCache: function (oParent, aRowsCache, oDetail, opts) {
      if (!oParent) return;

      var toStableString = opts.toStableString;
      var rowGuidKey = opts.rowGuidKey;
      var getCodAgg = this.getCodAgg.bind(this);

      var g = toStableString(oParent && (oParent.guidKey || oParent.GUID || oParent.Guid));
      if (!g) return;

      if (String(g).indexOf("-new") >= 0 || oParent.__isNew) return;

      var aMatch = (aRowsCache || []).filter(function (r) {
        return rowGuidKey(r) === g;
      });

      var aToDelete = (aMatch || []).filter(function (r) {
        var ca = getCodAgg(r);
        if (ca === "N") return false;
        if (ca === "D") return false;
        var rg = rowGuidKey(r);
        if (String(rg).indexOf("-new") >= 0 || r.__isNew) return false;
        return true;
      });

      if (!aToDelete.length) {
        aToDelete = [oParent];
      }

      var aStash = oDetail.getProperty("/__deletedLinesForPost") || [];

      aToDelete.forEach(function (r) {
        var x = deepClone(r) || {};
        if (x.CODAGG !== undefined) delete x.CODAGG;
        x.CodAgg = "D";
        x.__deletedAt = new Date().toISOString();
        aStash.push(x);
      });

      oDetail.setProperty("/__deletedLinesForPost", aStash);
    },

    // =========================
    // SHOW ERROR MESSAGE
    // =========================
    showPostErrorMessagePage: function (aErrLines) {
      var aErr = Array.isArray(aErrLines) ? aErrLines : [];
      if (!aErr.length) return;

      var r0 = aErr[0] || {};
      var sMsg0 = this.normMsg(r0) || "Errore in salvataggio";

      var parts = [];
      if (r0.PartitaFornitore) parts.push("Partita " + r0.PartitaFornitore);
      if (r0.Fibra) parts.push("Fibra " + r0.Fibra);
      var sHead = parts.length ? (" (" + parts.join(" - ") + ")") : "";

      var sToast = "Salvataggio NON completato: " + sMsg0 + sHead;
      if (aErr.length > 1) sToast += " (+ altri " + (aErr.length - 1) + ")";

      sap.m.MessageToast.show(sToast, { duration: 6000, width: "30em" });
    },

        _touchCodAggParent: function (p, sPath) {
      if (!p) return;

      var ca = this._getCodAgg(p);
      var isNew = !!p.__isNew || String(p.guidKey || p.Guid || p.GUID || "").indexOf("-new") >= 0;

      if (ca === "N") return;

      var newCa = ca;
      if (isNew) {
        newCa = "I";
      } else if (ca === "" || ca === "I") {
        newCa = "U";
      }

      var parentChanged = (newCa !== ca);
      if (parentChanged) {
        p.CodAgg = newCa;
        if (p.CODAGG !== undefined) delete p.CODAGG;

        try {
          var oDetail = this._getODetail();
          if (oDetail) {
            if (sPath && typeof sPath === "string") {
              oDetail.setProperty(sPath + "/CodAgg", p.CodAgg);
            }

            var idx = (p.idx != null) ? parseInt(p.idx, 10) : NaN;
            if (!isNaN(idx)) {
              var aAll = oDetail.getProperty("/RecordsAll") || [];
              for (var i = 0; i < aAll.length; i++) {
                if (parseInt(aAll[i] && aAll[i].idx, 10) === idx) {
                  oDetail.setProperty("/RecordsAll/" + i + "/CodAgg", p.CodAgg);
                  break;
                }
              }
            }
          }
        } catch (e) { }
      }

      var g = this._toStableString(p.guidKey || p.Guid || p.GUID);
      if (!g) return;

      var oVm = this._getOVm();
      var sKey = this._getExportCacheKey();
      var aRaw = oVm.getProperty("/cache/dataRowsByKey/" + sKey) || [];
      if (!Array.isArray(aRaw)) aRaw = [];

      var changed = false;

      aRaw.forEach(function (r) {
        if (!r) return;
        if (this._rowGuidKey(r) !== g) return;

        var rc = this._getCodAgg(r);
        var rIsNew = !!r.__isNew || String(r.Guid || r.GUID || r.guidKey || "").indexOf("-new") >= 0;

        if (rc === "N" || rc === "D") return;

        if (rIsNew) {
          if (r.CodAgg !== "I") { r.CodAgg = "I"; changed = true; }
        } else {
          if (rc === "" || rc === "I") {
            if (r.CodAgg !== "U") { r.CodAgg = "U"; changed = true; }
          }
        }

        if (r.CODAGG !== undefined) { delete r.CODAGG; changed = true; }
      }.bind(this));

      if (changed) {
        oVm.setProperty("/cache/dataRowsByKey/" + sKey, aRaw);
      }
    },

  };
});