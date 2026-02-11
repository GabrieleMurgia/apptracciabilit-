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
  "apptracciabilita/apptracciabilita/util/normalize",
  "apptracciabilita/apptracciabilita/util/vmCache"
], function (Controller, History, N, VmCache) {
  "use strict";

  return Controller.extend("apptracciabilita.apptracciabilita.controller.BaseController", {

    /**
     * Screen prefix for log output. Override in subclass.
     * @example "[S3]", "[S4]", "[S2]"
     */
    _sLogPrefix: "[BASE]",

    // ==================== LOGGING ====================

    /**
     * Timestamped console.log with screen prefix.
     */
    _log: function () {
      var a = Array.prototype.slice.call(arguments);
      a.unshift(this._sLogPrefix + " " + N.ts());
      console.log.apply(console, a);
    },

    /**
     * Debug log (suppressed if this._DBG === false).
     */
    _dbg: function () {
      if (this._DBG === false) return;
      var a = Array.prototype.slice.call(arguments);
      a.unshift(this._sLogPrefix + "DBG " + N.ts());
      console.log.apply(console, a);
    },

    /**
     * Log MDC table state (column count, visible cols, delegate).
     */
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

    /**
     * Get or create the global "vm" JSONModel with cache structure.
     */
    _getOVm: function () {
      return VmCache.ensureVmCache(this.getOwnerComponent());
    },

    /**
     * Get the local "detail" model of the current view.
     */
    _getODetail: function () {
      return this.getView().getModel("detail");
    },

    // ==================== CACHE KEYS ====================

    /**
     * Build a safe cache key from vendor + material.
     * Requires this._sVendorId and this._sMaterial to be set.
     */
    _getCacheKeySafe: function () {
      return VmCache.getCacheKeySafe(this._sVendorId, this._sMaterial);
    },

    /**
     * Build a cache key with MOCK|/REAL| prefix.
     * Override in subclass if mock flag name differs.
     * @param {string} [sMockFlag] - Mock flag path, defaults to "mockS3"
     */
    _getExportCacheKey: function (sMockFlag) {
      var oVm = this.getOwnerComponent().getModel("vm");
      var mock = (oVm && oVm.getProperty("/mock")) || {};
      var sFlag = sMockFlag || this._sMockFlag || "mockS3";
      return (mock[sFlag] ? "MOCK|" : "REAL|") + this._getCacheKeySafe();
    },

    // ==================== MOCK DETECTION ====================

    /**
     * Check if mock mode is enabled for a given flag.
     * @param {string} [sFlag] - Mock flag name, defaults to this._sMockFlag
     */
    _isMockEnabled: function (sFlag) {
      var oVm = this.getOwnerComponent().getModel("vm");
      var mock = (oVm && oVm.getProperty("/mock")) || {};
      return !!(mock[sFlag || this._sMockFlag || "mockS3"]);
    },

    // ==================== NAVIGATION ====================

    /**
     * Navigate back with unsaved-changes guard.
     * Override _hasUnsavedChanges() and _performNavBack() in subclass.
     */
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

    /**
     * Perform the actual navigation back.
     * Uses browser history if available, otherwise falls back to a route.
     * Override _getNavBackFallback() to specify the fallback route.
     */
    _performNavBack: function () {
      var sPreviousHash = History.getInstance().getPreviousHash();
      if (sPreviousHash !== undefined) {
        window.history.go(-1);
      } else {
        var fb = this._getNavBackFallback();
        this.getOwnerComponent().getRouter().navTo(fb.route, fb.params, true);
      }
    },

    /**
     * Fallback route when no browser history. Override in subclass.
     * @returns {{ route: string, params: object }}
     */
    _getNavBackFallback: function () {
      return { route: "Screen0", params: {} };
    }
  });
});