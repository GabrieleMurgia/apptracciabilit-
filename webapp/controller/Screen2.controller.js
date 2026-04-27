sap.ui.define([
  "apptracciabilita/apptracciabilita/controller/BaseController",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/model/Sorter",
  "sap/ui/core/BusyIndicator",
  "sap/m/MessageToast",
  "apptracciabilita/apptracciabilita/util/normalize",
  "apptracciabilita/apptracciabilita/util/screenFlowStateUtil",
  "apptracciabilita/apptracciabilita/util/screen2FlowUtil",
  "apptracciabilita/apptracciabilita/util/i18nUtil"
], function (BaseController, JSONModel, Filter, FilterOperator, Sorter, BusyIndicator, MessageToast, N, ScreenFlowStateUtil, Screen2FlowUtil, I18n) {
  "use strict";

  // Local helpers (use N.safeStr / N.lc from normalize.js)
  var safeStr = N.safeStr;

  return BaseController.extend("apptracciabilita.apptracciabilita.controller.Screen2", {

    _sLogPrefix: "[S2]",

    onMatStatusPress: function (oEvent) {
      var oBtn = oEvent.getSource();
      var oCtx = oBtn.getBindingContext();
      if (!oCtx) return;
      Screen2FlowUtil.onMatStatusPress({
        context: oCtx,
        button: oBtn,
        vendorId: this._sVendorId,
        odataModel: this.getOwnerComponent().getModel(),
        viewModel: this.getView().getModel(),
        contextForI18n: this
      });
    },

    onInit: function () {
      var oRouter = this.getOwnerComponent().getRouter();
      oRouter.getRoute("Screen2").attachPatternMatched(this._onRouteMatched, this);

      var oModel = new JSONModel({
        CurrentVendorId: "",
        CurrentVendorName: "",
        MatCategories: [],
        SelectedMatCat: "",
        Materials: [],
        DescCatMaterialeValues: [],
        StagioneValues: []
      });
      this.getView().setModel(oModel);
    },
    onDeselectAll: function () {
    var oTable = this.byId("tableMaterials2");
    if (oTable) {
        oTable.removeSelections(true);
    }
    },

    _onRouteMatched: function (oEvent) {
      var oArgs = oEvent.getParameter("arguments") || {};
      this._sMode = oArgs.mode || "A";
      this._sVendorId = decodeURIComponent(oArgs.vendorId || "");

      // Reset MultiComboBox selections when navigating to this screen
      var oDescCatCombo = this.byId("inputDescCatFilter2");
      if (oDescCatCombo) { oDescCatCombo.setSelectedKeys([]); }
      var oSeasonCombo = this.byId("inputSeasonFilter2");
      if (oSeasonCombo) { oSeasonCombo.setSelectedKeys([]); }

      var self = this;
      this._ensureUserInfosLoaded().then(function () {
        self._log("route matched", { mode: self._sMode, vendorId: self._sVendorId });

        var oViewModel = self.getView().getModel();
        oViewModel.setProperty("/CurrentVendorId", self._sVendorId);

        var oVm = self.getOwnerComponent().getModel("vm");
        var sVendorName = self._sVendorId;

        if (oVm) {
          var aVendors = oVm.getProperty("/userVendors") || oVm.getProperty("/UserInfosVend") || [];
          var oVendor = aVendors.find(function (v) {
            return safeStr(v.Fornitore || v.VENDOR || v.Lifnr) === safeStr(self._sVendorId);
          });

          if (oVendor) sVendorName = oVendor.ReagSoc || oVendor.RagSoc || oVendor.Name || sVendorName;
        }

        oViewModel.setProperty("/CurrentVendorName", sVendorName);
        self._loadMaterials();
      });
    },

onTableSelectionChange: function (oEvent) {
  var oItem = oEvent.getParameter("listItem");
  var bSelected = oEvent.getParameter("selected");
  if (!oItem || !bSelected) return;

  var oCtx = oItem.getBindingContext();
  var oRow = oCtx && oCtx.getObject();
  var sStatus = safeStr(oRow && oRow.MatStatus).trim().toUpperCase();

    if (sStatus === "DMMY") {
    if(this.getView().getModel().getData().showMatStatusCol){
    oItem.setSelected(false);
    MessageToast.show(I18n.text(this, "msg.cannotSelectDummyMaterials", [], "Non puoi selezionare materiali con stato DMMY."));
    }
    }
},

onMassApprovePress: function () {
  this._massUpdateMaterialStatus("RELE");
},

onMassRejectPress: function () {
  this._massUpdateMaterialStatus("LOCK");
},

_massUpdateMaterialStatus: function (sTargetStatus) {
  var oTable = this.byId("tableMaterials2");
  if (!oTable) return;

  var aSelectedItems = oTable.getSelectedItems() || [];
  if (aSelectedItems.length === 0) {
    MessageToast.show(I18n.text(this, "msg.selectAtLeastOneMaterial", [], "Seleziona almeno un materiale."));
    return;
  }

  var sTarget = safeStr(sTargetStatus).trim().toUpperCase();

  // ====== 1) RIGHE PROCESSABILI (DMMY escluso + logica toggle) ======
  var aRows = aSelectedItems
    .map(function (it) { return it.getBindingContext() && it.getBindingContext().getObject(); })
    .filter(Boolean)
    .filter(function (r) {
      var st = safeStr(r.MatStatus).trim().toUpperCase();
      if (st === "DMMY") return false;

      if (sTarget === "RELE") return st === "LOCK"; // Approvo => sblocca i LOCK
      if (sTarget === "LOCK") return st !== "LOCK"; // Rifiuto => blocca i non-LOCK (RELE)
      return false;
    });

  if (aRows.length === 0) {
    MessageToast.show(
      sTarget === "RELE"
        ? I18n.text(this, "msg.noLockedRecordSelected", [], "Nessun record BLOCCATO (LOCK) selezionato.")
        : I18n.text(this, "msg.noUnlockedRecordSelected", [], "Nessun record SBLOCCATO (RELE) selezionato.")
    );
    return;
  }

  // ====== 2) VENDOR (padded) ======
  var sVendor = N.normalizeVendor10(this._sVendorId);

  // ====== 3) METADATA HELPERS (self-contained) ======
  var oODataModel = this.getOwnerComponent().getModel();
  var md = oODataModel && oODataModel.getServiceMetadata && oODataModel.getServiceMetadata();
  var aSchemas = (md && md.dataServices && md.dataServices.schema) || [];

  function findEntitySet(sSetName) {
    var out = null;
    aSchemas.some(function (s) {
      return (s.entityContainer || []).some(function (c) {
        return (c.entitySet || []).some(function (es) {
          if (es.name === sSetName) { out = es; return true; }
          return false;
        });
      });
    });
    return out;
  }

  function findEntityType(etFullName) {
    var etName = (etFullName || "").split(".").pop();
    var out = null;
    aSchemas.some(function (s) {
      out = (s.entityType || []).find(function (t) { return t.name === etName; });
      return !!out;
    });
    return out;
  }

  function findAssociation(relFullName) {
    var assocName = (relFullName || "").split(".").pop();
    var out = null;
    aSchemas.some(function (s) {
      out = (s.association || []).find(function (a) { return a.name === assocName; });
      return !!out;
    });
    return out;
  }

  function pickProp(aProps, aCandidates) {
    for (var i = 0; i < aCandidates.length; i++) {
      if (aProps.indexOf(aCandidates[i]) !== -1) return aCandidates[i];
    }
    return null;
  }

  // ====== 4) CAPISCO HEADER + NAV + ITEM TYPE ======
  var esMass = findEntitySet("MassMaterialStatusSet");
  if (!esMass) {
    MessageToast.show(I18n.text(this, "msg.massMaterialStatusSetNotFound", [], "MassMaterialStatusSet non trovato nel metadata runtime."));
    return;
  }

  var etMass = findEntityType(esMass.entityType);
  if (!etMass) {
    MessageToast.show(I18n.text(this, "msg.massMaterialStatusEntityTypeNotFound", [], "EntityType di MassMaterialStatusSet non trovato nel metadata runtime."));
    return;
  }

  var aHeaderProps = (etMass.property || []).map(function (p) { return p.name; });
  var aNavs = (etMass.navigationProperty || []).map(function (n) { return n.name; });

  var pHeaderVendor = pickProp(aHeaderProps, ["Fornitore", "Vendor", "Lifnr", "VENDOR"]);
  if (!pHeaderVendor) {
    console.warn("[Screen2] Mass header props:", aHeaderProps);
    MessageToast.show(I18n.text(this, "msg.massMaterialStatusVendorPropertyMissing", [], "Metadata MassMaterialStatusSet: non trovo la property Vendor/Fornitore. Controlla console."));
    return;
  }

  var sNavName =
    pickProp(aNavs, ["ToItems", "Items", "MassItems", "MaterialItems", "ToMaterialItems"]) ||
    (aNavs[0] || null);

  if (!sNavName) {
    console.warn("[Screen2] Mass header props:", aHeaderProps, "navs:", aNavs);
    MessageToast.show(I18n.text(this, "msg.massMaterialStatusNavigationMissing", [], "MassMaterialStatusSet non ha navigation property per passare l'array (deep insert). Controlla console."));
    return;
  }

  var oNav = (etMass.navigationProperty || []).find(function (n) { return n.name === sNavName; });
  var assoc = oNav && findAssociation(oNav.relationship);
  if (!assoc) {
    console.warn("[Screen2] Nav:", oNav);
    MessageToast.show(I18n.text(this, "msg.navigationAssociationNotResolved", [], "Non riesco a risalire all'associazione della navigation property (vedi console)."));
    return;
  }

  var endTo = (assoc.end || []).find(function (e) { return e.role === oNav.toRole; });
  if (!endTo || !endTo.type) {
    console.warn("[Screen2] Assoc:", assoc, "nav:", oNav);
    MessageToast.show(I18n.text(this, "msg.navigationItemTypeNotResolved", [], "Non riesco a risalire al tipo degli item della lista (vedi console)."));
    return;
  }

  var etItem = findEntityType(endTo.type);
  if (!etItem) {
    console.warn("[Screen2] Item type:", endTo.type);
    MessageToast.show(I18n.text(this, "msg.navigationItemEntityTypeNotFound", [], "EntityType item della lista non trovato (vedi console)."));
    return;
  }

  var aItemProps = (etItem.property || []).map(function (p) { return p.name; });

  var pItemMat = pickProp(aItemProps, ["Materiale", "Material", "Matnr", "MATNR"]);
  var pItemSeason = pickProp(aItemProps, ["Stagione", "Season", "Saison"]);
  var pItemStatus = pickProp(aItemProps, ["MatStatus", "Status", "MaterialStatus", "Zstatus"]);
  var pItemVendor = pickProp(aItemProps, ["Fornitore", "Vendor", "Lifnr", "VENDOR"]);

  if (!pItemMat || !pItemStatus) {
    console.warn("[Screen2] Mass item props:", aItemProps, "itemType:", etItem.name);
    MessageToast.show(I18n.text(this, "msg.navigationItemMetadataIncompatible", [], "Metadata item non compatibile: non trovo Material(e) e/o Status (vedi console)."));
    return;
  }

  // ====== 5) BUILD ITEMS PAYLOAD (solo proprietà esistenti) ======
  var aItemsPayload = aRows.map(function (r) {
    var o = {};
    if (pItemVendor) o[pItemVendor] = sVendor;
    o[pItemMat] = safeStr(r.MaterialOriginal || r.Material).trim();
    if (pItemSeason) o[pItemSeason] = safeStr(r.Stagione).trim();
    o[pItemStatus] = safeStr(sTargetStatus).trim();
    return o;
  });

  // ====== 6) BACKEND: DEEP INSERT (1 POST) ======
  var oPayload = {};
  oPayload[pHeaderVendor] = sVendor;
  oPayload[sNavName] = { results: aItemsPayload };

  BusyIndicator.show(0);
  this.byId("btnMassApprove") && this.byId("btnMassApprove").setEnabled(false);
  this.byId("btnMassReject") && this.byId("btnMassReject").setEnabled(false);

  oODataModel.create("/MassMaterialStatusSet", oPayload, {
    success: function () {
      BusyIndicator.hide();
      this.byId("btnMassApprove") && this.byId("btnMassApprove").setEnabled(true);
      this.byId("btnMassReject") && this.byId("btnMassReject").setEnabled(true);

      oTable.removeSelections(true);

      this._loadMaterials();

      MessageToast.show(I18n.text(this, "msg.massOperationCompleted", [aItemsPayload.length], "Operazione massiva completata ({0})"));
    }.bind(this),

    error: function (oError) {
      BusyIndicator.hide();
      this.byId("btnMassApprove") && this.byId("btnMassApprove").setEnabled(true);
      this.byId("btnMassReject") && this.byId("btnMassReject").setEnabled(true);

      console.error("[Screen2] MassMaterialStatusSet deep insert error", oError, {
        headerProps: aHeaderProps,
        navs: aNavs,
        itemProps: aItemProps,
        navUsed: sNavName
      });

      MessageToast.show(I18n.text(this, "msg.massOperationError", [N.getBackendErrorMessage(oError)], "Errore operazione massiva: {0}"));
    }.bind(this)
  });
},

    _loadMaterials: function () {
      var oViewModel = this.getView().getModel();
      var oVm = this.getOwnerComponent().getModel("vm");
      this._log("_loadMaterials", { vendorId: this._sVendorId, userId: (oVm && oVm.getProperty("/userId")) || "" });
      Screen2FlowUtil.loadMaterials({
        vendorId: this._sVendorId,
        vmModel: oVm,
        viewModel: oViewModel,
        odataModel: this.getOwnerComponent().getModel(),
        applyFiltersFn: this._applyFilters.bind(this)
      });
    },

    onFilterChanged: function () {
      // Clear residual typed text from MultiComboBox filters
      var oSeasonCombo = this.byId("inputSeasonFilter2");
      if (oSeasonCombo) setTimeout(function () { oSeasonCombo.setValue(""); }, 0);
      var oDescCatCombo = this.byId("inputDescCatFilter2");
      if (oDescCatCombo) setTimeout(function () { oDescCatCombo.setValue(""); }, 0);

      this._applyFilters();
    },

    _applyFilters: function () {
      var oTable = this.byId("tableMaterials2");
      var oBinding = oTable && oTable.getBinding("items");
      if (!oBinding) return;
      Screen2FlowUtil.applyFilters({
        binding: oBinding,
        onlyIncomplete: this.byId("switchOnlyIncomplete2").getState(),
        selectedSeasons: this.byId("inputSeasonFilter2").getSelectedKeys(),
        materialOnly: (this.byId("inputMaterialOnly2").getValue() || "").trim().toLowerCase(),
        generalQuery: (this.byId("inputMaterialFilter2").getValue() || "").trim().toLowerCase(),
        selectedDescCats: this.byId("inputDescCatFilter2").getSelectedKeys()
      });
    },

    // ==================== SORT DIALOG ====================
    onOpenSortDialog: function () {
      if (!this._oSortDialog) {
        this._oSortDialog = new sap.m.ViewSettingsDialog({
          title: "Ordina materiali",
          sortItems: [
            new sap.m.ViewSettingsItem({ key: "Material", text: "Materiale" }),
            new sap.m.ViewSettingsItem({ key: "MaterialDescription", text: "Descrizione" }),
            new sap.m.ViewSettingsItem({ key: "DescCatMateriale", text: "Cat. Materiale" }),
            new sap.m.ViewSettingsItem({ key: "Stagione", text: "Stagione" }),
            new sap.m.ViewSettingsItem({ key: "Rejected", text: "Rifiutati" }),
            new sap.m.ViewSettingsItem({ key: "Modified", text: "Modificati" }),
            new sap.m.ViewSettingsItem({ key: "Pending", text: "In attesa approvazione" }),
            new sap.m.ViewSettingsItem({ key: "Approved", text: "Approvati" })
          ],
          confirm: function (oEvt) {
            var oSortItem = oEvt.getParameter("sortItem");
            var bDesc = oEvt.getParameter("sortDescending");
            var oTable = this.byId("tableMaterials2");
            var oBinding = oTable && oTable.getBinding("items");
            if (!oBinding || !oSortItem) return;
            oBinding.sort(new Sorter(oSortItem.getKey(), bDesc));
          }.bind(this)
        });
        this.getView().addDependent(this._oSortDialog);
      }
      this._oSortDialog.open();
    },

    // ==================== MATERIAL PRESS ====================
    onMaterialPress: function (oEvent) {
      var oSrc = oEvent.getParameter("srcControl");
      if (oSrc && oSrc.isA && oSrc.isA("sap.m.Button")) {
        return;
      }
      var oItem = oEvent.getParameter("listItem") || oEvent.getSource().getSelectedItem();
if (!oItem) return;
      var oCtx = oItem.getBindingContext();

      var sSeason = oCtx.getProperty("Stagione");
      var sMaterial = oCtx.getProperty("Material");
      var sMaterialDesc = oCtx.getProperty("MaterialDescription");
      var sMaterialOrig = oCtx.getProperty("MaterialOriginal");
      var sCatMateriale = oCtx.getProperty("CatMateriale") || "";

      var oVm = this.getOwnerComponent().getModel("vm");

      // ── NoMatList: controlla se la categoria del materiale ha NoMatList='X' ──
      var bNoMatList = false;
      if (sCatMateriale && oVm) {
        var aMMCT = oVm.getProperty("/UserInfosMMCT") || oVm.getProperty("/userMMCT") || [];
        var oCatRec = aMMCT.find(function (c) {
          return String(c.CatMateriale || "").trim().toUpperCase() === sCatMateriale.toUpperCase();
        });
        if (oCatRec && String(oCatRec.NoMatList || "").trim().toUpperCase() === "X") {
          bNoMatList = true;
        }
      }
      ScreenFlowStateUtil.setNoMatListContext(oVm, bNoMatList, sCatMateriale);
      if (bNoMatList) {
        this._log("NoMatList attivo per categoria", sCatMateriale, "-> Screen3 con filtro categoria");
      }

      // Cache MATINFO per OpenOda
      try {
        if (oVm) {
          var cache = oVm.getProperty("/cache") || { dataRowsByKey: {}, recordsByKey: {} };
          cache.recordsByKey = cache.recordsByKey || {};

          var sOpen = safeStr(oCtx.getProperty("Open")).trim();
          var nOpenPo = Number(oCtx.getProperty("OpenPo")) || 0;

          var k = "MATINFO|" + String(this._sVendorId) + "|" + String(sMaterial);
          cache.recordsByKey[k] = {
            desc: sMaterialDesc,
            orig: sMaterialOrig,
            open: sOpen,
            openPo: nOpenPo
          };

          oVm.setProperty("/cache", cache);
        }
      } catch (e) {
        console.warn("[Screen2] cache MATINFO error", e);
      }

      this.getOwnerComponent().getRouter().navTo("Screen3", {
        vendorId: encodeURIComponent(this._sVendorId),
        material: encodeURIComponent(sMaterial),
        season: encodeURIComponent(sSeason),
        mode: this._sMode || "A"
      });
    },

    // NavBack fallback: torna a Screen1
    _getNavBackFallback: function () {
      return { route: "Screen1", params: { mode: this._sMode || "A" } };
    }
  });
});
