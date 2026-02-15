sap.ui.define([
  "sap/ui/core/BusyIndicator",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "apptracciabilita/apptracciabilita/util/common",
  "apptracciabilita/apptracciabilita/util/postUtil"
], function (BusyIndicator, MessageToast, MessageBox, Common, PostUtil) {
  "use strict";

  var deepClone = Common.deepClone;

  return {

    /**
     * Validazione campi required prima del POST
     * @param {object} opts - { oDetail, oVm, getCacheKeySafe, getExportCacheKey, toStableString, rowGuidKey, getCodAgg }
     */
    validateRequiredBeforePost: function (opts) {
      var oDetail = opts.oDetail;
      var oVm = opts.oVm;
      var getCacheKeySafe = opts.getCacheKeySafe;
      var getExportCacheKey = opts.getExportCacheKey;
      var toStableString = opts.toStableString;
      var rowGuidKey = opts.rowGuidKey;
      var getCodAgg = opts.getCodAgg;

      var aParents = (oDetail && oDetail.getProperty("/RecordsAll")) || [];
      if (!Array.isArray(aParents)) aParents = [];

      var sCacheKey = getExportCacheKey();
      var aRawAll = oVm.getProperty("/cache/dataRowsByKey/" + sCacheKey) || [];
      if (!Array.isArray(aRawAll)) aRawAll = [];

      var sKSafe = getCacheKeySafe();
      var mAllS4 = oVm.getProperty("/cache/screen4DetailsByKey") || {};
      var mByIdx = (mAllS4 && mAllS4[sKSafe]) ? mAllS4[sKSafe] : {};

      var mGuidByIdxAll = oVm.getProperty("/cache/screen4ParentGuidByIdx") || {};
      var mGuidByIdx = (mGuidByIdxAll && mGuidByIdxAll[sKSafe]) ? mGuidByIdxAll[sKSafe] : {};

      var maps = PostUtil.getRequiredMapFromMmct(oDetail);
      var req01 = maps.req01 || {};
      var req02 = maps.req02 || {};

      var isEmpty = Common.isEmpty;

      function toStr(v) { return String(v == null ? "" : v).trim(); }

      function uniqNonEmpty(arr) {
        var seen = {};
        var out = [];
        (arr || []).forEach(function (x) {
          x = toStr(x);
          if (!x) return;
          if (seen[x]) return;
          seen[x] = true;
          out.push(x);
        });
        return out;
      }

      function getRowNoFromParent(p, iLoop) {
        var idx = (p && p.idx != null) ? parseInt(p.idx, 10) : NaN;
        if (!isNaN(idx)) return idx + 1;
        return iLoop + 1;
      }

      var mRawByGuid = {};
      (aRawAll || []).forEach(function (r) {
        if (!r) return;

        var ca = getCodAgg(r);
        if (ca === "N") return;
        if (ca === "D") return;

        var g = rowGuidKey(r);
        g = toStr(g);
        if (!g) return;

        if (!mRawByGuid[g]) mRawByGuid[g] = [];
        mRawByGuid[g].push(r);
      });

      var errors = [];
      var seenErr = {};

      function addErr(pageLabel, rowNo, field, label) {
        var k = pageLabel + "|" + rowNo + "|" + field;
        if (seenErr[k]) return;
        seenErr[k] = true;

        errors.push({
          page: pageLabel,
          scope: pageLabel,
          row: rowNo,
          field: field || "",
          label: label || field || ""
        });
      }

      (aParents || []).forEach(function (p, iLoop) {
        if (!p) return;

        if (getCodAgg(p) === "N") return;

        var rowNo = getRowNoFromParent(p, iLoop);

        Object.keys(req01).forEach(function (k) {
          var meta = req01[k] || {};
          var v = p ? p[k] : undefined;
          if (isEmpty(v)) {
            addErr("Pagina corrente", rowNo, k, meta.label || k);
          }
        });

        var iIdx = (p && p.idx != null) ? parseInt(p.idx, 10) : NaN;

        var aDet = [];
        var aDetByIdx = (!isNaN(iIdx) && mByIdx && Array.isArray(mByIdx[String(iIdx)]))
          ? (mByIdx[String(iIdx)] || [])
          : null;

        if (Array.isArray(aDetByIdx) && aDetByIdx.length) {
          aDet = aDetByIdx;
        } else {
          var gParent = toStableString(p && (p.guidKey || p.GUID || p.Guid || p.GuidKey));
          var gByIdx = (!isNaN(iIdx) && mGuidByIdx && mGuidByIdx[String(iIdx)])
            ? toStableString(mGuidByIdx[String(iIdx)])
            : "";

          var aCandidates = uniqNonEmpty([
            gParent,
            gByIdx,
            p && p.Guid,
            p && p.GUID,
            p && p.guidKey,
            p && p.GuidKey
          ]);

          aCandidates.forEach(function (g) {
            var chunk = mRawByGuid[g];
            if (Array.isArray(chunk) && chunk.length) {
              aDet = aDet.concat(chunk);
            }
          });
        }

        if (!Array.isArray(aDet) || !aDet.length) return;

        aDet.forEach(function (r) {
          Object.keys(req02).forEach(function (k) {
            var meta = req02[k] || {};
            var v = r ? r[k] : undefined;
            if (isEmpty(v)) {
              addErr("Dettaglio", rowNo, k, meta.label || k);
            }
          });
        });

      });

      errors.sort(function (a, b) {
        var ra = a.row || 0;
        var rb = b.row || 0;
        if (ra !== rb) return ra - rb;

        var pa = (a.page === "Pagina corrente") ? 0 : 1;
        var pb = (b.page === "Pagina corrente") ? 0 : 1;
        if (pa !== pb) return pa - pb;

        return String(a.label || "").localeCompare(String(b.label || ""));
      });

      return { ok: errors.length === 0, errors: errors };
    },

    /**
     * Costruisce il payload per la POST
     * @param {object} opts - tutte le dipendenze necessarie
     */
    buildSavePayload: function (opts) {
      var oDetail = opts.oDetail;
      var oVm = opts.oVm;
      var sUserId = opts.userId;
      var sVendor10 = opts.vendor10;
      var sMaterial = opts.material;
      var getExportCacheKey = opts.getExportCacheKey;
      var toStableString = opts.toStableString;
      var getCodAgg = opts.getCodAgg;
      var getMultiFieldsMap = opts.getMultiFieldsMap;
      var normalizeMultiString = opts.normalizeMultiString;
      var uuidv4Fn = opts.uuidv4;

      var aParents = (oDetail && oDetail.getProperty("/RecordsAll")) || [];

      aParents = (aParents || []).filter(function (p) {
        return getCodAgg(p) !== "N";
      });

      var sCacheKey = getExportCacheKey();
      var aRawAll = oVm.getProperty("/cache/dataRowsByKey/" + sCacheKey) || [];
      if (!Array.isArray(aRawAll)) aRawAll = [];

      var aS01 = (oDetail && oDetail.getProperty("/_mmct/s01")) || [];
      var aParentKeys = (aS01 || [])
        .map(function (f) {
          var k = f && f.ui ? String(f.ui).trim() : "";
          if (!k) return "";
          if (k.toUpperCase() === "STATO") k = "Stato";
          return k;
        })
        .filter(Boolean);

      if (aParentKeys.indexOf("Stato") < 0) aParentKeys.push("Stato");
      aParentKeys = aParentKeys.filter(function (k) { return k !== "Fibra"; });
      if (aParentKeys.indexOf("Stato") < 0) aParentKeys.push("Stato");

      function norm(v) { return String(v == null ? "" : v).trim(); }

      function isEmpty(v) {
        if (v == null) return true;
        if (Array.isArray(v)) return v.length === 0;
        if (typeof v === "string") return v.trim() === "";
        return false;
      }

      function guidOf(x) {
        return norm(x && (
          x.Guid != null ? x.Guid :
            (x.GUID != null ? x.GUID :
              (x.guidKey != null ? x.guidKey :
                (x.GuidKey != null ? x.GuidKey :
                  (x.ItmGuid != null ? x.ItmGuid :
                    (x.ItemGuid != null ? x.ItemGuid : ""))))))
        );
      }

      function fibraOf(x) {
        return norm(x && (x.Fibra != null ? x.Fibra : (x.FIBRA != null ? x.FIBRA : "")));
      }

      var mGroupGuidByParent = {};

      function parentKeyOf(p) {
        return String(p && (p.guidKey || p.GUID || p.Guid || p.idx) || "").trim();
      }

      function getGroupGuid(p) {
        var g = guidOf(p);
        if (g && g.indexOf("-new") < 0) return g;

        var pk = parentKeyOf(p);
        if (!mGroupGuidByParent[pk]) mGroupGuidByParent[pk] = uuidv4Fn();
        return mGroupGuidByParent[pk];
      }

      var mRawByGuid = {};
      aRawAll.forEach(function (r) {
        var g = guidOf(r);
        if (!g) return;
        if (!mRawByGuid[g]) mRawByGuid[g] = [];
        mRawByGuid[g].push(r);
      });

      var mMulti = getMultiFieldsMap();

      var sanitizeForPost = function (rAny) {
        var r = rAny || {};
        var o = {};

        Object.keys(r).forEach(function (k) {
          if (!k) return;
          if (k.indexOf("__") === 0) return;
          if (k === "__metadata" || k === "AllData") return;
          if (k === "idx" || k === "guidKey" || k === "StatoText") return;

          var v = r[k];

          if (mMulti[k]) {
            v = normalizeMultiString(v, "|");
          } else if (Array.isArray(v)) {
            v = v.join(";");
          }

          if ((k === "InizioVal" || k === "FineVal" || k === "DataIns" || k === "DataMod") && (v === "" || v === undefined)) {
            v = null;
          }

          o[k] = (v === undefined ? "" : v);
        });

        if (!o.Fornitore) o.Fornitore = sVendor10;
        if (!o.Materiale) o.Materiale = sMaterial;

        var g = guidOf(r) || guidOf(o);
        if (!g || g.indexOf("-new") >= 0) g = null;

        o.Guid = g;

        if (o.GUID !== undefined) delete o.GUID;
        if (o.GuidKey !== undefined) delete o.GuidKey;
        if (o.guidKey !== undefined) delete o.guidKey;

        o.UserID = sUserId;

        return o;
      };

      var aLines = [];
      (aParents || []).forEach(function (p) {
        var gP = guidOf(p);
        var fP = fibraOf(p);

        var gGroup = getGroupGuid(p);

        var aRows = (gP && mRawByGuid[gP]) ? mRawByGuid[gP] : [];

        if (!aRows.length) aRows = [deepClone(p) || {}];

        aRows.forEach(function (r0) {
          var r = deepClone(r0) || {};

          r.Guid = gGroup;

          // Preserve per-row Stato and Note ALWAYS — each raw row has its own
          // status lifecycle (approve/reject happens per-Fibra in Screen4)
          var sRowStato = norm(r.Stato);
          var sRowNote = r.Note != null ? String(r.Note) : "";

          aParentKeys.forEach(function (k) {
            // NEVER override Stato/Note from parent — each row keeps its own
            if (k === "Stato" || k === "Note") return;
            if (p && p[k] !== undefined) r[k] = p[k];
          });

          Object.keys(p || {}).forEach(function (k) {
            if (!k) return;
            if (k.indexOf("__") === 0) return;
            if (k === "idx" || k === "guidKey" || k === "StatoText") return;
            // NEVER override Stato/Note from parent
            if (k === "Stato" || k === "Note") return;
            if (r[k] === undefined || isEmpty(r[k])) r[k] = p[k];
          });

          // Restore preserved Stato (always) — fallback to parent only if row has none
          if (sRowStato) {
            r.Stato = sRowStato;
          } else {
            var stP = norm(p && (p.__status || p.Stato));
            if (stP) r.Stato = stP;
          }
          // Restore preserved Note (always)
          if (sRowNote) {
            r.Note = sRowNote;
          }

          if (!isEmpty(p.Fibra)) {
            if (r.Guid && r.Guid.includes && r.Guid.includes("new")) {
              r.Fibra = p.Fibra;
            } else {
              r.Fibra = r.Fibra;
            }
          } else if (isEmpty(r.Fibra) && !isEmpty(fP)) {
            r.Fibra = fP;
          }

          var stP = norm(p && (p.__status || p.Stato));
          if (isEmpty(r.Stato) && stP) r.Stato = stP;

          if (!guidOf(r) && gGroup) {
            r.Guid = gGroup;
          }

          if (isEmpty(r.Fibra) && fP) r.Fibra = fP;

          if (!r.Fornitore) r.Fornitore = sVendor10;
          if (!r.Materiale) r.Materiale = sMaterial;
          r.UserID = sUserId;

          aLines.push(sanitizeForPost(r));
        });
      });

      var aDeleted = (oDetail && oDetail.getProperty("/__deletedLinesForPost")) || [];
      if (Array.isArray(aDeleted) && aDeleted.length) {
        aDeleted.forEach(function (rDel) {
          var x = deepClone(rDel) || {};
          if (x.CODAGG !== undefined) delete x.CODAGG;
          x.CodAgg = "D";
          aLines.push(sanitizeForPost(x));
        });
      }

      // Propaga U a tutte le righe con stesso Guid
      var mGuidHasU = Object.create(null);

      (aLines || []).forEach(function (line) {
        var g = toStableString(line && line.Guid);
        if (!g) return;

        var ca = getCodAgg(line);
        if (ca === "U") mGuidHasU[g] = true;
      });

      (aLines || []).forEach(function (line) {
        var g = toStableString(line && line.Guid);
        if (!g || !mGuidHasU[g]) return;

        var ca = getCodAgg(line);

        if (ca === "") {
          line.CodAgg = "U";
          if (line.CODAGG !== undefined) delete line.CODAGG;
        }
      });

      var oPayload = {
        UserID: sUserId,
        PostDataCollection: aLines
          .filter(function (i) {
            var ca = getCodAgg(i);
            return !(ca === "N" || ca === "");
          })
          .map(function (l) {
            var x = Object.assign({}, l);
            delete x.ToApprove;
            delete x.Rejected;
            delete x.Approved;
            return x;
          })
      };

      return oPayload;
    },

    /**
     * Esegue la chiamata POST
     */
    executePost: function (opts) {
      var oModel = opts.oModel;
      var oPayload = opts.payload;
      var bMock = opts.mock;
      var onSuccess = opts.onSuccess;
      var onPartialError = opts.onPartialError;
      var onFullError = opts.onFullError;

      console.log("[SaveUtil] Payload /PostDataSet (UNIFIED)", JSON.parse(JSON.stringify(oPayload)));

      if (!oPayload.PostDataCollection || !oPayload.PostDataCollection.length) {
        MessageToast.show("Nessuna riga da salvare");
        return;
      }

      if (bMock) {
        MessageToast.show("MOCK attivo: POST non eseguita (payload in Console)");
        return;
      }

      BusyIndicator.show(0);

      oModel.create("/PostDataSet", oPayload, {
        urlParameters: { "sap-language": "IT" },

        success: function (oData, oResponse) {
          BusyIndicator.hide();

          console.log("[SaveUtil] POST success - oResponse:", oResponse);
          console.log("[SaveUtil] POST success - oData:", JSON.parse(JSON.stringify(oData || {})));

          var aResp = PostUtil.extractPostResponseLines(oData);
          console.log("[SaveUtil] POST response lines:", aResp);

          var aErr = (aResp || []).filter(function (r) {
            var es = String(r && r.Esito || "").trim().toUpperCase();
            return es && es !== "OK";
          });

          if (aErr.length) {
            if (onPartialError) onPartialError(aErr, oData);
            return;
          }

          MessageToast.show("Salvataggio completato");
          if (onSuccess) onSuccess(oData);
        },

        error: function (oError) {
          BusyIndicator.hide();
          var msg = Common.readODataError(oError) || "Errore in salvataggio (vedi Console)";
          console.error("[SaveUtil] POST ERROR", oError);
          MessageToast.show(msg);
          if (onFullError) onFullError(oError);
        }
      });
    }

  };
});