sap.ui.define([
  "apptracciabilita/apptracciabilita/controller/BaseController",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/core/BusyIndicator",
  "sap/m/MessageToast",
  "apptracciabilita/apptracciabilita/util/normalize",
  "apptracciabilita/apptracciabilita/util/mockData"
], function (BaseController, JSONModel, Filter, FilterOperator, BusyIndicator, MessageToast, N, MockData) {
  "use strict";

  // Local helpers (use N.safeStr / N.lc from normalize.js)
  var safeStr = N.safeStr;
  var lc = N.lc;

  function getODataErrorMessage(oError) {
    try {
      if (oError && oError.responseText) {
        var o = JSON.parse(oError.responseText);
        var v = o && o.error && o.error.message && (o.error.message.value || o.error.message);
        if (v) return String(v);
      }
      if (oError && oError.message) return String(oError.message);
    } catch (e) { /* ignore */ }
    return "Errore imprevisto";
  }

  function recomputeSupportFields(row) {
    var searchAll = [
      safeStr(row.Material),
      safeStr(row.MaterialOriginal),
      safeStr(row.MaterialDescription),
      safeStr(row.DescCatMateriale),
      safeStr(row.CatMateriale),
      safeStr(row.Stagione),
      safeStr(row.MatStatus),
      safeStr(row.Open),
      safeStr(row.Rejected),
      safeStr(row.Pending),
      safeStr(row.Approved)
    ].join(" ");

    row.StagioneLC = lc(row.Stagione);
    row.MaterialLC = lc(row.Material);
    row.DescCatMaterialeLC = lc(row.DescCatMateriale);
    row.MaterialOriginalLC = lc(row.MaterialOriginal);
    row.SearchAllLC = lc(searchAll);
  }

  function buildRow(m) {
    var materialOrig = safeStr(m.Materiale).trim();
    var desc = safeStr(m.DescMateriale).trim();
    var descCat = safeStr(m.DescCatMateriale).trim();
    var catMat = safeStr(m.CatMateriale).trim();           // ← NoMatList: campo categoria
    var season = safeStr(m.Stagione).trim();
    var status = safeStr(m.MatStatus).trim();

    var open = safeStr(m.Open).trim();
    var rejected = Number(m.Rejected) || 0;
    var pending = Number(m.ToApprove) || 0;
    var approved = Number(m.Approved) || 0;

    var searchAll = [
      materialOrig, desc, descCat, catMat, season, status,
      open, rejected, pending, approved
    ].join(" ");

    return {
      Material: materialOrig,
      MaterialOriginal: materialOrig,
      MaterialDescription: desc,
      DescCatMateriale: descCat,
      CatMateriale: catMat,                                 // ← NoMatList: esposto nel record

      Stagione: season,
      MatStatus: status,

      OpenPo: open === "X" ? 1 : 0,
      Open: open,
      Rejected: rejected,
      Pending: pending,
      ToApprove: pending,
      Approved: approved,

      StagioneLC: lc(season),
      MaterialLC: lc(materialOrig),
      DescCatMaterialeLC: lc(descCat),
      MaterialOriginalLC: lc(materialOrig),
      SearchAllLC: lc(searchAll)
    };
  }

  /**
   * Extracts distinct values for MultiComboBox filters from the materials array
   * and sets them on the view model.
   */
  function _extractDistinctFilterValues(aMaterials, oViewModel) {
    var oSeenCat = {}, oSeenSeason = {};
    var aDescCatValues = [], aStagioneValues = [];

    aMaterials.forEach(function (r) {
      var cat = (r.DescCatMateriale || "").trim();
      if (cat && !oSeenCat[cat]) {
        oSeenCat[cat] = true;
        aDescCatValues.push({ key: cat, text: cat });
      }
      var stag = (r.Stagione || "").trim();
      if (stag && !oSeenSeason[stag]) {
        oSeenSeason[stag] = true;
        aStagioneValues.push({ key: stag, text: stag });
      }
    });

    oViewModel.setProperty("/DescCatMaterialeValues", aDescCatValues);
    oViewModel.setProperty("/StagioneValues", aStagioneValues);
  }

  return BaseController.extend("apptracciabilita.apptracciabilita.controller.Screen2", {

    _sLogPrefix: "[S2]",

    onMatStatusPress: function (oEvent) {
      var oBtn = oEvent.getSource();
      var oCtx = oBtn.getBindingContext();
      if (!oCtx) return;

      var oRow = oCtx.getObject() || {};
      var sPath = oCtx.getPath();

      var sVendor = safeStr(this._sVendorId).trim();
      if (MockData && typeof MockData.padVendor === "function") {
        sVendor = MockData.padVendor(sVendor);
      }

      var sMateriale = safeStr(oRow.MaterialOriginal || oRow.Material).trim();
      var sStagione = safeStr(oRow.Stagione).trim();
      var sCurr = safeStr(oRow.MatStatus).trim();
      var sNewStatus = (sCurr === "LOCK") ? "RELE" : "LOCK";

      var oPayload = {
        Fornitore: sVendor,
        Materiale: sMateriale,
        Stagione: sStagione,
        MatStatus: sNewStatus
      };

      var oVm = this.getOwnerComponent().getModel("vm");
      var mock = (oVm && oVm.getProperty("/mock")) || {};
      var bMockS2 = !!mock.mockS2;

      if (bMockS2) {
        var oJson = this.getView().getModel();
        oJson.setProperty(sPath + "/MatStatus", sNewStatus);
        var r = oJson.getProperty(sPath);
        recomputeSupportFields(r);
        oJson.refresh(true);
        MessageToast.show("MOCK: stato aggiornato a " + sNewStatus);
        return;
      }

      var oODataModel = this.getOwnerComponent().getModel();
      var oJsonModel = this.getView().getModel();

      oBtn.setEnabled(false);
      BusyIndicator.show(0);

      oODataModel.create("/MaterialStatusSet", oPayload, {
        success: function (oData) {
          BusyIndicator.hide();
          oBtn.setEnabled(true);

          var sReturnedStatus = safeStr((oData && oData.MatStatus) || sNewStatus).trim();
          oJsonModel.setProperty(sPath + "/MatStatus", sReturnedStatus);

          if (oData && oData.Stagione !== undefined) {
            oJsonModel.setProperty(sPath + "/Stagione", safeStr(oData.Stagione).trim());
          }
          if (oData && oData.Open !== undefined) {
            var openVal = safeStr(oData.Open).trim();
            oJsonModel.setProperty(sPath + "/Open", openVal);
            oJsonModel.setProperty(sPath + "/OpenPo", openVal === "X" ? 1 : 0);
          }
          if (oData && oData.Rejected !== undefined) {
            oJsonModel.setProperty(sPath + "/Rejected", Number(oData.Rejected) || 0);
          }
          if (oData && oData.ToApprove !== undefined) {
            var pend = Number(oData.ToApprove) || 0;
            oJsonModel.setProperty(sPath + "/Pending", pend);
            oJsonModel.setProperty(sPath + "/ToApprove", pend);
          }
          if (oData && oData.Approved !== undefined) {
            oJsonModel.setProperty(sPath + "/Approved", Number(oData.Approved) || 0);
          }

          var row = oJsonModel.getProperty(sPath);
          recomputeSupportFields(row);
          oJsonModel.refresh(true);
          MessageToast.show("Stato aggiornato con successo");
        },
        error: function (oError) {
          BusyIndicator.hide();
          oBtn.setEnabled(true);
          console.error("[Screen2] MaterialStatusSet POST error", oError);
          MessageToast.show("Errore aggiornamento stato: " + getODataErrorMessage(oError));
        }
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

    _loadMaterials: function () {
      var oViewModel = this.getView().getModel();
      var oVm = this.getOwnerComponent().getModel("vm");
      var mock = (oVm && oVm.getProperty("/mock")) || {};
      var bMockS2 = !!mock.mockS2;

      this._log("_loadMaterials mock?", { mockS2: bMockS2, mock: mock });

      if (bMockS2) {
        var sVendorWanted = MockData.padVendor(this._sVendorId);
        var sUserId = String((oVm && oVm.getProperty("/userId")) || "E_ZEMAF").trim();

        BusyIndicator.show(0);
        this._log("[MOCK FILE] loading MaterialDataSet.json", { userId: sUserId, vendorId: sVendorWanted });

        MockData.loadMaterialDataSetGeneric().then(function (aAll) {
          var aMaterials = aAll.map(buildRow);
          oViewModel.setProperty("/showMatStatusCol", aMaterials.some(function (r) { return String(r.MatStatus || "").trim() !== "DMMY"; }));
          oViewModel.setProperty("/Materials", aMaterials);
          _extractDistinctFilterValues(aMaterials, oViewModel);
          this._applyFilters();
        }.bind(this)).catch(function (err) {
          console.error("[Screen2][MOCK FILE] ERROR", err);
          MessageToast.show("MOCK MaterialDataSet.json NON TROVATO o non leggibile");
        }).finally(function () {
          BusyIndicator.hide();
        });

        return;
      }

      var oODataModel = this.getOwnerComponent().getModel();
      var that = this;
      var sVendorId = this._sVendorId;
      var sUserId2 = (oVm && oVm.getProperty("/userId")) || "E_ZEMAF";

      BusyIndicator.show(0);

      var aFilters = [
        new Filter("Fornitore", FilterOperator.EQ, sVendorId),
        new Filter("UserID", FilterOperator.EQ, sUserId2)
      ];

      oODataModel.read("/MaterialDataSet", {
        filters: aFilters,
        success: function (oData) {
          BusyIndicator.hide();
          var aResults = (oData && oData.results) || [];
          var aMaterials = aResults.map(buildRow);

          oViewModel.setProperty("/Materials", aMaterials);
          oViewModel.setProperty("/showMatStatusCol",
            aMaterials.some(function (r) { return String(r.MatStatus || "").trim() !== "DMMY"; })
          );
          _extractDistinctFilterValues(aMaterials, oViewModel);
          that._applyFilters();
        },
        error: function (oError) {
          BusyIndicator.hide();
          console.error("Errore lettura MaterialDataSet", oError);
          MessageToast.show("Errore nel caricamento dei materiali");
        }
      });
    },

    onFilterChanged: function () {
      this._applyFilters();
    },

    _applyFilters: function () {
      var oTable = this.byId("tableMaterials2");
      var oBinding = oTable && oTable.getBinding("items");
      if (!oBinding) return;

      var bOnlyIncomplete = this.byId("switchOnlyIncomplete2").getState();
      var aSelectedSeasons = this.byId("inputSeasonFilter2").getSelectedKeys();
      var sMaterialOnly = (this.byId("inputMaterialOnly2").getValue() || "").trim().toLowerCase();
      var sGeneral = (this.byId("inputMaterialFilter2").getValue() || "").trim().toLowerCase();
      var aSelectedDescCat = this.byId("inputDescCatFilter2").getSelectedKeys();

      var aFilters = [];

      if (bOnlyIncomplete) {
        aFilters.push(new Filter({
          filters: [
            new Filter("OpenPo", FilterOperator.GT, 0),
            new Filter("Pending", FilterOperator.GT, 0),
            new Filter("Rejected", FilterOperator.GT, 0)
          ],
          and: false
        }));
      }

      if (aSelectedDescCat.length > 0) {
        aFilters.push(new Filter({
          filters: aSelectedDescCat.map(function (v) {
            return new Filter("DescCatMateriale", FilterOperator.EQ, v);
          }),
          and: false
        }));
      }

      if (aSelectedSeasons.length > 0) {
        aFilters.push(new Filter({
          filters: aSelectedSeasons.map(function (v) {
            return new Filter("Stagione", FilterOperator.EQ, v);
          }),
          and: false
        }));
      }

      if (sMaterialOnly) {
        aFilters.push(new Filter({
          filters: [
            new Filter("MaterialLC", FilterOperator.Contains, sMaterialOnly),
            new Filter("MaterialOriginalLC", FilterOperator.Contains, sMaterialOnly)
          ],
          and: false
        }));
      }

      if (sGeneral) {
        aFilters.push(new Filter("SearchAllLC", FilterOperator.Contains, sGeneral));
      }

      oBinding.filter(aFilters, "Application");
    },

    // ==================== MATERIAL PRESS ====================
    onMaterialPress: function (oEvent) {
      var oSrc = oEvent.getParameter("srcControl");
      if (oSrc && oSrc.isA && oSrc.isA("sap.m.Button")) {
        return;
      }
      var oItem = oEvent.getSource().getSelectedItem();
      var oCtx = oItem.getBindingContext();

      var sSeason = oCtx.getProperty("Stagione");
      var sMaterial = oCtx.getProperty("Material");
      var sMaterialDesc = oCtx.getProperty("MaterialDescription");
      var sMaterialOrig = oCtx.getProperty("MaterialOriginal");
      var sCatMateriale = oCtx.getProperty("CatMateriale") || "";   // ← NoMatList

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
      if (oVm) {
        oVm.setProperty("/__noMatListMode", bNoMatList);
        oVm.setProperty("/__noMatListCat", bNoMatList ? sCatMateriale : "");
      }
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