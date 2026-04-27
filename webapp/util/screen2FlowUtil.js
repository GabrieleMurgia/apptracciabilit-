sap.ui.define([
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/core/BusyIndicator",
  "sap/m/MessageToast",
  "apptracciabilita/apptracciabilita/util/normalize",
  "apptracciabilita/apptracciabilita/util/screenFlowStateUtil",
  "apptracciabilita/apptracciabilita/util/i18nUtil"
], function (Filter, FilterOperator, BusyIndicator, MessageToast, N, ScreenFlowStateUtil, I18n) {
  "use strict";

  var safeStr = N.safeStr;
  var lc = N.lc;

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
    var catMat = safeStr(m.CatMateriale).trim();
    var season = safeStr(m.Stagione).trim();
    var status = safeStr(m.MatStatus).trim();

    var open = safeStr(m.Open).trim();
    var rejected = Number(m.Rejected) || 0;
    var pending = Number(m.ToApprove) || 0;
    var approved = Number(m.Approved) || 0;
    var modified = Number(m.Modified) || 0;

    var row = {
      Material: materialOrig,
      MaterialOriginal: materialOrig,
      MaterialDescription: desc,
      DescCatMateriale: descCat,
      CatMateriale: catMat,
      Stagione: season,
      MatStatus: status,
      OpenPo: open === "X" ? 1 : 0,
      Open: open,
      Rejected: rejected,
      Pending: pending,
      ToApprove: pending,
      Approved: approved,
      Modified: modified
    };
    recomputeSupportFields(row);
    return row;
  }

  function extractDistinctFilterValues(aMaterials, oViewModel) {
    var oSeenCat = {}, oSeenSeason = {};
    var aDescCatValues = [], aStagioneValues = [];

    (aMaterials || []).forEach(function (r) {
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

  return {
    recomputeSupportFields: recomputeSupportFields,
    buildRow: buildRow,
    extractDistinctFilterValues: extractDistinctFilterValues,

    onMatStatusPress: function (opts) {
      var oCtx = opts.context;
      var oRow = oCtx.getObject() || {};
      var sPath = oCtx.getPath();
      var sVendor = N.normalizeVendor10(opts.vendorId);
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

      opts.button.setEnabled(false);
      BusyIndicator.show(0);
      opts.odataModel.create("/MaterialStatusSet", oPayload, {
        success: function (oData) {
          BusyIndicator.hide();
          opts.button.setEnabled(true);

          var sReturnedStatus = safeStr((oData && oData.MatStatus) || sNewStatus).trim();
          opts.viewModel.setProperty(sPath + "/MatStatus", sReturnedStatus);

          if (oData && oData.Stagione !== undefined) {
            opts.viewModel.setProperty(sPath + "/Stagione", safeStr(oData.Stagione).trim());
          }
          if (oData && oData.Open !== undefined) {
            var openVal = safeStr(oData.Open).trim();
            opts.viewModel.setProperty(sPath + "/Open", openVal);
            opts.viewModel.setProperty(sPath + "/OpenPo", openVal === "X" ? 1 : 0);
          }
          if (oData && oData.Rejected !== undefined) {
            opts.viewModel.setProperty(sPath + "/Rejected", Number(oData.Rejected) || 0);
          }
          if (oData && oData.ToApprove !== undefined) {
            var pend = Number(oData.ToApprove) || 0;
            opts.viewModel.setProperty(sPath + "/Pending", pend);
            opts.viewModel.setProperty(sPath + "/ToApprove", pend);
          }
          if (oData && oData.Approved !== undefined) {
            opts.viewModel.setProperty(sPath + "/Approved", Number(oData.Approved) || 0);
          }

          var row = opts.viewModel.getProperty(sPath);
          recomputeSupportFields(row);
          opts.viewModel.refresh(true);
          MessageToast.show(I18n.text(opts.contextForI18n || null, "msg.statusUpdatedSuccessfully", [], "Stato aggiornato con successo"));
        },
        error: function (oError) {
          BusyIndicator.hide();
          opts.button.setEnabled(true);
          console.error("[Screen2FlowUtil] MaterialStatusSet POST error", oError);
          MessageToast.show(I18n.text(opts.contextForI18n || null, "msg.statusUpdateError", [N.getBackendErrorMessage(oError)], "Errore aggiornamento stato: {0}"));
        }
      });
    },

    loadMaterials: function (opts) {
      var sVendorId = opts.vendorId;
      var sUserId = (opts.vmModel && opts.vmModel.getProperty("/userId")) || "";
      BusyIndicator.show(0);

      var aFilters = [
        new Filter("Fornitore", FilterOperator.EQ, sVendorId),
        new Filter("UserID", FilterOperator.EQ, sUserId)
      ];

      var sSelectedCat = ScreenFlowStateUtil.getSelectedCatMateriale(opts.vmModel);
      if (sSelectedCat) {
        aFilters.push(new Filter("CatMateriale", FilterOperator.EQ, sSelectedCat));
      }

      opts.odataModel.read("/MaterialDataSet", {
        filters: aFilters,
        success: function (oData) {
          BusyIndicator.hide();
          var aResults = (oData && oData.results) || [];
          var aMaterials = aResults.map(buildRow);
          opts.viewModel.setProperty("/Materials", aMaterials);
          opts.viewModel.setProperty("/showMatStatusCol",
            aMaterials.some(function (r) { return String(r.MatStatus || "").trim() !== "DMMY"; })
          );
          extractDistinctFilterValues(aMaterials, opts.viewModel);
          opts.applyFiltersFn();
        },
        error: function (oError) {
          BusyIndicator.hide();
          console.error("[Screen2FlowUtil] Errore lettura MaterialDataSet", oError);
          MessageToast.show(N.getBackendErrorMessage(oError));
        }
      });
    },

    applyFilters: function (opts) {
      if (!opts.binding) return;
      var aFilters = [];

      if (opts.onlyIncomplete) {
        aFilters.push(new Filter({
          filters: [
            new Filter("OpenPo", FilterOperator.GT, 0),
            new Filter("Pending", FilterOperator.GT, 0),
            new Filter("Rejected", FilterOperator.GT, 0)
          ],
          and: false
        }));
      }

      if ((opts.selectedDescCats || []).length > 0) {
        aFilters.push(new Filter({
          filters: opts.selectedDescCats.map(function (v) {
            return new Filter("DescCatMateriale", FilterOperator.EQ, v);
          }),
          and: false
        }));
      }

      if ((opts.selectedSeasons || []).length > 0) {
        aFilters.push(new Filter({
          filters: opts.selectedSeasons.map(function (v) {
            return new Filter("Stagione", FilterOperator.EQ, v);
          }),
          and: false
        }));
      }

      if (opts.materialOnly) {
        aFilters.push(new Filter({
          filters: [
            new Filter("MaterialLC", FilterOperator.Contains, opts.materialOnly),
            new Filter("MaterialOriginalLC", FilterOperator.Contains, opts.materialOnly)
          ],
          and: false
        }));
      }

      if (opts.generalQuery) {
        aFilters.push(new Filter("SearchAllLC", FilterOperator.Contains, opts.generalQuery));
      }

      opts.binding.filter(aFilters, "Application");
    }
  };
});
