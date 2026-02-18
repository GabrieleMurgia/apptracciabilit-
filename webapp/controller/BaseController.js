/**
 * BaseController.js — Base controller for all screens.
 *
 * Centralizes:
 * - Logging (_log, _logTable)
 * - VM / Detail model access (_getOVm, _getODetail)
 * - Cache key helpers (_getCacheKeySafe, _getExportCacheKey)
 * - Navigation (onNavBack, _performNavBack)
 * - Mock detection (_isMockEnabled)
 */
sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/routing/History",
  "sap/ui/core/BusyIndicator",
  "apptracciabilita/apptracciabilita/util/normalize",
  "apptracciabilita/apptracciabilita/util/vmCache"
], function (Controller, History, BusyIndicator, N, VmCache) {
  "use strict";

  return Controller.extend("apptracciabilita.apptracciabilita.controller.BaseController", {

    /**
     * Screen prefix for log output. Override in subclass.
     * @example "[S3]", "[S4]", "[S2]"
     */
    _sLogPrefix: "[BASE]",

    // ==================== LOGGING ====================

    _log: function () {
      var a = Array.prototype.slice.call(arguments);
      a.unshift(this._sLogPrefix + " " + N.ts());
      console.log.apply(console, a);
    },

    _dbg: function () {
      if (this._DBG === false) return;
      var a = Array.prototype.slice.call(arguments);
      a.unshift(this._sLogPrefix + "DBG " + N.ts());
      console.log.apply(console, a);
    },

    _logTable: function (label, sTableId) {
      var oTbl = this.byId(sTableId || this.PARENT_TABLE_ID || "mdcTable3");
      if (!oTbl) return this._log(label, "NO TABLE");
      var aCols = (oTbl.getColumns && oTbl.getColumns()) || [];
      this._log(label, {
        id: oTbl.getId(),
        colsCount: aCols.length,
        visibleCols: aCols.filter(function (c) { return c.getVisible && c.getVisible(); }).length,
        delegate: oTbl.getDelegate && oTbl.getDelegate()
      });
    },

    // ==================== MODEL ACCESS ====================

    _getOVm: function () {
      return VmCache.ensureVmCache(this.getOwnerComponent());
    },

    _getODetail: function () {
      return this.getView().getModel("detail");
    },

    // ==================== CACHE KEYS ====================

    _getCacheKeySafe: function () {
      return VmCache.getCacheKeySafe(this._sVendorId, this._sMaterial);
    },

    _getExportCacheKey: function (sMockFlag) {
      var oVm = this.getOwnerComponent().getModel("vm");
      var mock = (oVm && oVm.getProperty("/mock")) || {};
      var sFlag = sMockFlag || this._sMockFlag || "mockS3";
      return (mock[sFlag] ? "MOCK|" : "REAL|") + this._getCacheKeySafe();
    },

    // ==================== MOCK DETECTION ====================

    _isMockEnabled: function (sFlag) {
      var oVm = this.getOwnerComponent().getModel("vm");
      var mock = (oVm && oVm.getProperty("/mock")) || {};
      return !!(mock[sFlag || this._sMockFlag || "mockS3"]);
    },

    // ==================== USER INFOS GUARD ====================

    /**
     * Check if UserInfos data has been loaded into the "vm" model.
     * Returns true if essential data (userId, userType, mmctFieldsByCat) is present.
     */
    _isUserInfosLoaded: function () {
      var oVm = this.getOwnerComponent().getModel("vm");
      if (!oVm) return false;
      var sUserId = oVm.getProperty("/userId");
      var sUserType = oVm.getProperty("/userType");
      var mMmct = oVm.getProperty("/mmctFieldsByCat");
      return !!(sUserId && sUserType && mMmct && Object.keys(mMmct).length > 0);
    },

    /**
     * Ensure UserInfos are loaded. If not (e.g. browser refresh), reload them.
     * Returns a Promise that resolves when data is ready.
     *
     * Usage in _onRouteMatched:
     *   this._ensureUserInfosLoaded().then(function() { ... proceed ... });
     */
    _ensureUserInfosLoaded: function () {
      if (this._isUserInfosLoaded()) {
        return Promise.resolve();
      }

      var oComponent = this.getOwnerComponent();
      var oVm = oComponent.getModel("vm");
      var oModel = oComponent.getModel(); // OData model

      // If vm doesn't exist yet, create a minimal one
      if (!oVm) {
        var JSONModel = sap.ui.require("sap/ui/model/json/JSONModel");
        oVm = new JSONModel({
          userId: "", userType: "", mock: {},
          cache: { dataRowsByKey: {}, recordsByKey: {} },
          mdcCfg: {}, domainsByName: {}, domainsByKey: {},
          mmctFieldsByCat: {}
        });
        oComponent.setModel(oVm, "vm");
      }

      // Check for mock mode
      var mock = oVm.getProperty("/mock") || {};
      if (mock.mockS0) {
        // Mock mode: delegate to Screen0 by redirecting
        this._log("_ensureUserInfosLoaded: mock mode, redirecting to Screen0");
        oComponent.getRouter().navTo("Screen0", {}, true);
        return new Promise(function () {}); // never resolves — user will be redirected
      }

      if (!oModel || typeof oModel.read !== "function") {
        this._log("_ensureUserInfosLoaded: no OData model, redirecting to Screen0");
        oComponent.getRouter().navTo("Screen0", {}, true);
        return new Promise(function () {});
      }

      var self = this;
      this._log("_ensureUserInfosLoaded: reloading UserInfos from backend...");
      BusyIndicator.show(0);

      return new Promise(function (resolve, reject) {
        oModel.metadataLoaded().then(function () {
          // Use the same userId as Screen0 — read from vm or default
          var sUserId = oVm.getProperty("/userId") || "E_ZEMAF";
          var sPath = "/UserInfosSet('" + sUserId + "')";

          oModel.read(sPath, {
            urlParameters: {
              "$expand": "UserInfosDomains/DomainsValues,UserInfosMMCT/UserMMCTFields,UserInfosVend",
              "sap-language": "IT"
            },
            success: function (oData) {
              BusyIndicator.hide();
              if (!oData) {
                self._log("_ensureUserInfosLoaded: no data returned, redirecting to Screen0");
                oComponent.getRouter().navTo("Screen0", {}, true);
                reject();
                return;
              }

              var sUserType = oData.UserType || "";
              var aDomains = (oData.UserInfosDomains && oData.UserInfosDomains.results) || [];
              var aMMCT = (oData.UserInfosMMCT && oData.UserInfosMMCT.results) || [];
              var aVend = (oData.UserInfosVend && oData.UserInfosVend.results) || [];

              var domainsByName = aDomains.reduce(function (acc, d) {
                acc[d.Domain] = ((d.DomainsValues && d.DomainsValues.results) || []).map(function (x) {
                  return { key: x.Value, text: x.Descrizione };
                });
                return acc;
              }, {});

              var domainsByKey = Object.keys(domainsByName).reduce(function (acc, dom) {
                var m = {};
                (domainsByName[dom] || []).forEach(function (it) { m[it.key] = it.text; });
                acc[dom] = m;
                return acc;
              }, {});

              var aAllFields = aMMCT.reduce(function (acc, cat) {
                return acc.concat((cat.UserMMCTFields && cat.UserMMCTFields.results) || []);
              }, []);

              var mmctFieldsByCat = aAllFields.reduce(function (acc, f) {
                var c = f && f.CatMateriale;
                if (!c) return acc;
                if (!acc[c]) acc[c] = [];
                acc[c].push(f);
                return acc;
              }, {});

              var t = String(sUserType || "").trim().toUpperCase();
              var auth = {
                role: (t === "E" ? "FORNITORE" : (t === "I" ? "VALENTINO" : (t === "S" ? "SUPERUSER" : "UNKNOWN"))),
                isSupplier: t === "E", isValentino: t === "I", isSuperuser: t === "S"
              };

              oVm.setData({
                userId: sUserId,
                userType: sUserType,
                userDescription: oData.UserDescription || "",
                showAggregatedTile: sUserType !== "E",
                auth: auth,
                mock: oVm.getProperty("/mock") || {},
                userDomains: aDomains,
                userCategories: aMMCT,
                userVendors: aVend,
                userMMCT: aMMCT,
                mmctFieldsByCat: mmctFieldsByCat,
                UserInfosMMCT: aMMCT,
                UserInfosVend: aVend,
                UserInfosDomains: aDomains,
                domainsByName: domainsByName,
                domainsByKey: domainsByKey,
                mdcCfg: oVm.getProperty("/mdcCfg") || {},
                cache: oVm.getProperty("/cache") || { dataRowsByKey: {}, recordsByKey: {} }
              }, true);

              self._log("_ensureUserInfosLoaded: OK", {
                userId: sUserId, userType: sUserType,
                vendors: aVend.length, mmctCats: Object.keys(mmctFieldsByCat).length
              });
              resolve();
            },
            error: function (oError) {
              BusyIndicator.hide();
              console.error("[BaseController] _ensureUserInfosLoaded ERROR", oError);
              oComponent.getRouter().navTo("Screen0", {}, true);
              reject(oError);
            }
          });
        }).catch(function (err) {
          BusyIndicator.hide();
          console.error("[BaseController] _ensureUserInfosLoaded metadata ERROR", err);
          oComponent.getRouter().navTo("Screen0", {}, true);
          reject(err);
        });
      });
    },

    // ==================== NAVIGATION ====================

    onNavBack: function () {
      if (typeof this._hasUnsavedChanges === "function" && this._hasUnsavedChanges()) {
        var self = this;
        sap.m.MessageBox.warning(
          "Hai modificato i dati. Sei sicuro di voler uscire senza salvare?",
          {
            title: "Modifiche non salvate",
            actions: [sap.m.MessageBox.Action.OK, sap.m.MessageBox.Action.CANCEL],
            emphasizedAction: sap.m.MessageBox.Action.CANCEL,
            onClose: function (s) {
              if (s === sap.m.MessageBox.Action.OK) self._performNavBack();
            }
          }
        );
      } else {
        this._performNavBack();
      }
    },

    _performNavBack: function () {
      var sPreviousHash = History.getInstance().getPreviousHash();
      if (sPreviousHash !== undefined) {
        window.history.go(-1);
      } else {
        var fb = this._getNavBackFallback();
        this.getOwnerComponent().getRouter().navTo(fb.route, fb.params, true);
      }
    },

    _getNavBackFallback: function () {
      return { route: "Screen0", params: {} };
    },

    // ==================== APPROVE / REJECT ====================

    /**
     * Get selected record objects from the MDC table.
     * Uses MdcTableUtil which handles selection plugins correctly.
     * Override _getApproveTableId() in subclass if needed.
     * @returns {object[]} Array of selected row objects
     */
    _getSelectedRowsForApproval: function () {
      var sTableId = this._getApproveTableId ? this._getApproveTableId() : (this.PARENT_TABLE_ID || "mdcTable3");
      var oMdc = this.byId(sTableId);
      if (!oMdc) return [];

      var MdcTableUtil = sap.ui.require("apptracciabilita/apptracciabilita/util/mdcTableUtil");
      if (MdcTableUtil && typeof MdcTableUtil.getSelectedObjectsFromMdc === "function") {
        return MdcTableUtil.getSelectedObjectsFromMdc(oMdc, "detail") || [];
      }

      // Fallback: try MDC-level API
      if (typeof oMdc.getSelectedContexts === "function") {
        return (oMdc.getSelectedContexts() || []).map(function (ctx) {
          return ctx.getObject ? ctx.getObject() : null;
        }).filter(Boolean);
      }

      return [];
    },

    /**
     * Approve selected rows: set Stato = "AP" and POST.
     */
    onApprove: function () {
      var aSelected = this._getSelectedRowsForApproval();
      if (!aSelected.length) {
        sap.m.MessageToast.show("Seleziona almeno un record da approvare");
        return;
      }

      var self = this;
      sap.m.MessageBox.confirm(
        "Vuoi approvare " + aSelected.length + " record selezionati?",
        {
          title: "Conferma Approvazione",
          onClose: function (sAction) {
            if (sAction === sap.m.MessageBox.Action.OK) {
              self._applyStatusChange(aSelected, "AP", "");
            }
          }
        }
      );
    },

    /**
     * Reject selected rows: open dialog for notes, then set Stato = "RJ".
     */
    onReject: function () {
      var aSelected = this._getSelectedRowsForApproval();
      if (!aSelected.length) {
        sap.m.MessageToast.show("Seleziona almeno un record da rifiutare");
        return;
      }

      var self = this;
      // Store current selection so the press handler always uses the latest
      this._pendingRejectSelection = aSelected;

      // Create reject dialog with notes field
      if (!this._oRejectDialog) {
        this._oRejectNoteTA = new sap.m.TextArea({
          width: "100%",
          rows: 4,
          placeholder: "Descrivi il motivo del rifiuto...",
          valueLiveUpdate: true
        });

        this._oRejectDialog = new sap.m.Dialog({
          title: "Rifiuta Record",
          type: "Message",
          state: "Warning",
          content: [
            new sap.m.VBox({
              items: [
                new sap.m.Text({ text: "" }),
                this._oRejectNoteTA
              ]
            })
          ],
          beginButton: new sap.m.Button({
            text: "Rifiuta",
            type: "Reject",
            press: function () {
              var sNote = (self._oRejectNoteTA.getValue() || "").trim();
              if (!sNote) {
                sap.m.MessageToast.show("Il motivo del rifiuto è obbligatorio");
                return;
              }
              self._oRejectDialog.close();
              // Use stored selection (not stale closure)
              var aSel = self._pendingRejectSelection || [];
              self._pendingRejectSelection = null;
              self._applyStatusChange(aSel, "RJ", sNote);
            }
          }),
          endButton: new sap.m.Button({
            text: "Annulla",
            press: function () {
              self._oRejectDialog.close();
              self._pendingRejectSelection = null;
            }
          }),
          afterClose: function () {
            self._oRejectNoteTA.setValue("");
          }
        });
      }

      // Update text with current selection count
      var oContent = this._oRejectDialog.getContent()[0];
      if (oContent && oContent.getItems) {
        oContent.getItems()[0].setText("Stai rifiutando " + aSelected.length + " record. Inserisci il motivo del rifiuto:");
      }

      this._oRejectDialog.open();
    },

    /**
     * Apply status change to selected rows and trigger save.
     * Override _onStatusChangeApplied() in subclass for screen-specific logic.
     *
     * @param {object[]} aSelected - Selected row objects
     * @param {string} sNewStatus - "AP" or "RJ"
     * @param {string} sNote - Rejection note (empty for approval)
     */
    _applyStatusChange: function (aSelected, sNewStatus, sNote) {
      var oDetail = this._getODetail();
      if (!oDetail) return;

      // Determine if we're operating on parent records (Screen3) or detail rows (Screen4)
      // Screen3 parents represent ALL fibras for a Guid -> always match by Guid only
      var sTableId = this._getApproveTableId ? this._getApproveTableId() : "";
      var bIsParentTable = (sTableId === "mdcTable3" || sTableId === this.PARENT_TABLE_ID);

      // Build keys for matching
      var aMatchGuids = []; // Guid-only matching (Screen3)
      var aCompositeKeys = []; // Guid+Fibra matching (Screen4)
      aSelected.forEach(function (r) {
        if (!r) return;
        var sGuid = String(r.guidKey || r.Guid || r.GUID || "").trim();
        if (!sGuid) return;

        if (bIsParentTable) {
          // Screen3: parent represents all fibras -> match by Guid only
          aMatchGuids.push(sGuid);
        } else {
          var sFibra = String(r.Fibra || r.FIBRA || "").trim();
          aCompositeKeys.push({ guid: sGuid, fibra: sFibra });
        }
      });

      console.log("[BaseController] _applyStatusChange", {
        newStatus: sNewStatus, isParentTable: bIsParentTable,
        guidKeys: aMatchGuids, compositeKeys: JSON.parse(JSON.stringify(aCompositeKeys)),
        selectedCount: aSelected.length
      });

      function matchesRow(r) {
        var sGuid = String(r.guidKey || r.Guid || r.GUID || "").trim();
        if (bIsParentTable) {
          // Screen3: match by Guid only (all fibras in this record)
          return aMatchGuids.indexOf(sGuid) >= 0;
        }
        // Screen4: match by Guid+Fibra
        var sFibra = String(r.Fibra || r.FIBRA || "").trim();
        return aCompositeKeys.some(function (ck) {
          if (ck.fibra) return ck.guid === sGuid && ck.fibra === sFibra;
          return ck.guid === sGuid;
        });
      }

      // Update RecordsAll (Screen3) or RowsAll (Screen4)
      var iUpdated = 0;
      var aAllPaths = ["/RecordsAll", "/RowsAll"];
      aAllPaths.forEach(function (sPath) {
        var aAll = oDetail.getProperty(sPath);
        if (!Array.isArray(aAll)) return;
        aAll.forEach(function (r) {
          if (!r || !matchesRow(r)) return;
          iUpdated++;

          r.Stato = sNewStatus;
          r.__status = sNewStatus;
          r.StatoText = (sNewStatus === "AP") ? "Approvato" : "Rifiutato";
          r.__readOnly = true;
          r.__canEdit = false;
          r.__canApprove = false;
          r.__canReject = false;

          if (sNewStatus === "RJ" && sNote) {
            r.Note = sNote;
          }
        });
      });

      console.log("[BaseController] _applyStatusChange updated", iUpdated, "rows in model");

      // Also update raw cache rows
      var oVm = this._getOVm();
      var sCacheKey = this._getExportCacheKey();
      var aRawAll = oVm.getProperty("/cache/dataRowsByKey/" + sCacheKey);
      var iRawUpdated = 0;
      if (Array.isArray(aRawAll)) {
        aRawAll.forEach(function (r) {
          if (!r) return;
          var sGuid = String(r.Guid || r.GUID || "").trim();

          var bMatch;
          if (bIsParentTable) {
            bMatch = aMatchGuids.indexOf(sGuid) >= 0;
          } else {
            var sFibra = String(r.Fibra || r.FIBRA || "").trim();
            bMatch = aCompositeKeys.some(function (ck) {
              if (ck.fibra) return ck.guid === sGuid && ck.fibra === sFibra;
              return ck.guid === sGuid;
            });
          }
          if (!bMatch) return;
          iRawUpdated++;

          r.Stato = sNewStatus;
          if (sNewStatus === "RJ" && sNote) r.Note = sNote;

          // Mark as updated so POST includes this row
          r.CodAgg = "U";
          if (r.CODAGG !== undefined) delete r.CODAGG;
        });
      }

      console.log("[BaseController] _applyStatusChange updated", iRawUpdated, "raw cache rows");

      oDetail.refresh(true);

      // Notify subclass
      if (typeof this._onStatusChangeApplied === "function") {
        this._onStatusChangeApplied(sNewStatus, aSelected);
      }

      sap.m.MessageToast.show(
        aSelected.length + " record " + (sNewStatus === "AP" ? "approvati" : "rifiutati") + ". Premi Salva per confermare."
      );
    }
  });
});