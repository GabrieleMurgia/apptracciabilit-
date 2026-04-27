/**
 * BaseController.js — Base controller for all screens.
 *
 * Centralizes:
 * - Logging (_log, _logTable)
 * - VM / Detail model access (_getOVm, _getODetail)
 * - Cache key helpers (_getCacheKeySafe, _getExportCacheKey)
 * - Navigation (onNavBack, _performNavBack)
 * - Header filter/sort dispatch (Screen3/5/6): _setInnerHeaderHeight,
 *   _applyInlineHeaderFilterSort, _onInlineCol*, onToggleHeader*,
 *   onOpenColumnFilters/Sort, onResetFiltersAndSort, _scheduleHeaderFilterSort
 *
 * Subclasses that use the header filter/sort helpers must declare:
 *   MAIN_TABLE_ID         e.g. "mdcTable3"
 *   MAIN_INPUT_FILTER_ID  e.g. "inputFilter3"
 */
sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/routing/History",
  "sap/ui/mdc/p13n/StateUtil",
  "apptracciabilita/apptracciabilita/util/normalize",
  "apptracciabilita/apptracciabilita/util/vmCache",
  "apptracciabilita/apptracciabilita/util/mdcTableUtil",
  "apptracciabilita/apptracciabilita/util/filterSortUtil",
  "apptracciabilita/apptracciabilita/util/p13nUtil",
  "apptracciabilita/apptracciabilita/util/i18nUtil",
  "apptracciabilita/apptracciabilita/util/baseUserInfoUtil",
  "apptracciabilita/apptracciabilita/util/baseApprovalUtil"
], function (Controller, History, StateUtil, N, VmCache, MdcTableUtil, FilterSortUtil, P13nUtil, I18n, BaseUserInfoUtil, BaseApprovalUtil) {
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

    _getExportCacheKey: function () {
      return "REAL|" + this._getCacheKeySafe();
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
      return BaseUserInfoUtil.ensureUserInfosLoaded({
        component: this.getOwnerComponent(),
        isLoadedFn: this._isUserInfosLoaded.bind(this),
        logFn: this._log.bind(this)
      });
    },

    // ==================== NAVIGATION ====================

    onNavBack: function () {
      if (typeof this._hasUnsavedChanges === "function" && this._hasUnsavedChanges()) {
        var self = this;
        sap.m.MessageBox.warning(
          I18n.text(this, "msg.unsavedChangesWarning", [], "Hai modificato i dati. Sei sicuro di voler uscire senza salvare?"),
          {
            title: I18n.text(this, "title.unsavedChanges", [], "Modifiche non salvate"),
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
        sap.m.MessageToast.show(I18n.text(this, "msg.selectAtLeastOneRecordToApprove", [], "Seleziona almeno un record da approvare"));
        return;
      }

      var self = this;
      sap.m.MessageBox.confirm(
        I18n.text(this, "msg.confirmApproveRecords", [aSelected.length], "Vuoi approvare {0} record selezionati?"),
        {
          title: I18n.text(this, "title.confirmApprove", [], "Conferma Approvazione"),
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
        sap.m.MessageToast.show(I18n.text(this, "msg.selectAtLeastOneRecordToReject", [], "Seleziona almeno un record da rifiutare"));
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
          placeholder: I18n.text(this, "placeholder.rejectReason", [], "Descrivi il motivo del rifiuto..."),
          valueLiveUpdate: true
        });

        this._oRejectDialog = new sap.m.Dialog({
          title: I18n.text(this, "title.rejectRecord", [], "Rifiuta Record"),
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
            text: I18n.text(this, "action.reject", [], "Rifiuta"),
            type: "Reject",
            press: function () {
              var sNote = (self._oRejectNoteTA.getValue() || "").trim();
              if (!sNote) {
                sap.m.MessageToast.show(I18n.text(self, "msg.rejectReasonRequired", [], "Il motivo del rifiuto è obbligatorio"));
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
            text: I18n.text(this, "action.cancel", [], "Annulla"),
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
      var sTableId = this._getApproveTableId ? this._getApproveTableId() : "";
      BaseApprovalUtil.applyStatusChange({
        context: this,
        detailModel: this._getODetail(),
        vmModel: this._getOVm(),
        cacheKey: this._getExportCacheKey(),
        selectedRows: aSelected,
        newStatus: sNewStatus,
        note: sNote,
        isParentTable: (sTableId === "mdcTable3" || sTableId === this.PARENT_TABLE_ID),
        onStatusChangeAppliedFn: (typeof this._onStatusChangeApplied === "function") ? this._onStatusChangeApplied.bind(this) : null
      });
    },

    // ==================== HEADER FILTER / SORT (Screen3/5/6) ====================

    _setInnerHeaderHeight: function (oMdcTbl) {
      try { MdcTableUtil.setInnerHeaderHeight(oMdcTbl, !!this.getView().getModel("ui").getProperty("/showHeaderFilters")); } catch (e) { console.debug("[BaseController] suppressed error", e); }
    },

    _applyInlineHeaderFilterSort: async function (oMdcTbl) {
      this._inlineFS = MdcTableUtil.ensureInlineFS(this._inlineFS);
      return MdcTableUtil.applyInlineHeaderFilterSort(oMdcTbl, {
        view: this.getView(), inlineFS: this._inlineFS,
        applyClientFilters: this._applyClientFilters.bind(this), log: this._log.bind(this)
      });
    },

    _onInlineColFilterLiveChange: function (oEvt) {
      FilterSortUtil.onInlineColFilterLiveChange(oEvt, this._inlineFS, this._applyClientFilters.bind(this));
    },

    _onInlineColSortPress: function (oEvt) {
      FilterSortUtil.onInlineColSortPress(oEvt, this._inlineFS, this._applyClientFilters.bind(this));
    },

    onToggleHeaderFilters: function () {
      FilterSortUtil.toggleHeaderFilters(this.getView().getModel("ui"), this.byId(this.MAIN_TABLE_ID), this._setInnerHeaderHeight.bind(this), this._applyInlineHeaderFilterSort.bind(this));
    },

    onToggleHeaderSort: function () {
      FilterSortUtil.toggleHeaderSort(this.getView().getModel("ui"), this.byId(this.MAIN_TABLE_ID), this._applyInlineHeaderFilterSort.bind(this));
    },

    onOpenColumnFilters: function () { this.onToggleHeaderFilters(); },
    onOpenSort: function () { this.onToggleHeaderSort(); },

    onResetFiltersAndSort: function () {
      FilterSortUtil.resetFiltersAndSort({
        oDetail: this._getODetail(), inlineFS: this._inlineFS, inputFilter: this.byId(this.MAIN_INPUT_FILTER_ID),
        table: this.byId(this.MAIN_TABLE_ID), applyClientFiltersFn: this._applyClientFilters.bind(this),
        applyInlineHeaderFilterSortFn: this._applyInlineHeaderFilterSort.bind(this),
        setInnerHeaderHeightFn: this._setInnerHeaderHeight.bind(this)
      });
    },

    _scheduleHeaderFilterSort: function (oTbl) {
      var self = this;
      setTimeout(function () {
        P13nUtil.forceP13nAllVisible(oTbl, StateUtil, self._log.bind(self), "t300");
        setTimeout(function () { self._applyInlineHeaderFilterSort(oTbl); }, 350);
      }, 300);
    }
  });
});
