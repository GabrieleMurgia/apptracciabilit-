

sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/ui/core/BusyIndicator"
], function (Controller, JSONModel, BusyIndicator) {
  "use strict";

  return Controller.extend("apptracciabilita.apptracciabilita.controller.Screen0", {
    onInit: function () {

      var oComponent = this.getOwnerComponent();

      var oVm = new JSONModel({
        userId: "",
        userType: "",
        userDescription: "",
        showAggregatedTile: false,

        userCategories: [],
        userVendors: [],

        userDomains: [],
        domainsByKey: {},
        domainsByName: {},

        userMMCT: [],
        mmctFieldsByCat: {},

        // usato dai controller 3/4 per delegate cfg
        mdcCfg: {},

        // cache usata da Screen3/4
        cache: {
          dataRowsByKey: {},
          recordsByKey: {}
        }
      });

      oComponent.setModel(oVm, "vm");

      var oModel = oComponent.getModel();
      var sUserId = "E_ZEMAF";

      var sPath = "/UserInfosSet('" + sUserId + "')";

      BusyIndicator.show(0);
      oModel.read(sPath, {
        urlParameters: {
          "$expand": "UserInfosDomains/DomainsValues,UserInfosMMCT/UserMMCTFields,UserInfosVend",
          "sap-language": "IT"
        },
        success: function (oData) {
          BusyIndicator.hide();

          if (!oData) {
            console.error("UserInfosSet: nessun dato restituito per", sUserId);
            return;
          }

          var sUserType = oData.UserType;

          var aDomains = (oData.UserInfosDomains && oData.UserInfosDomains.results) || [];
          var aMMCT = (oData.UserInfosMMCT && oData.UserInfosMMCT.results) || [];
          var aVend = (oData.UserInfosVend && oData.UserInfosVend.results) || [];

          // domainsByName: Domain -> [{key,text}]
          var domainsByName = aDomains.reduce(function (acc, d) {
            var sDom = d.Domain;
            acc[sDom] = ((d.DomainsValues && d.DomainsValues.results) || []).map(function (x) {
              var v = x.Value;
              return { key: v, text: v };
            });
            return acc;
          }, {});

          // domainsByKey: Domain -> { key: text }
          var domainsByKey = Object.keys(domainsByName).reduce(function (acc, dom) {
            var m = {};
            (domainsByName[dom] || []).forEach(function (it) {
              m[it.key] = it.text;
            });
            acc[dom] = m;
            return acc;
          }, {});

          // mmctFieldsByCat: Cat -> raw fields[]
          var mmctFieldsByCat = aMMCT.reduce(function (acc, cat) {
            acc[cat.CatMateriale] = ((cat.UserMMCTFields && cat.UserMMCTFields.results) || []);
            return acc;
          }, {});

          oVm.setData({
            userId: sUserId,
            userType: sUserType,
            userDescription: oData.UserDescription || "",
            showAggregatedTile: sUserType !== "E",

            userDomains: aDomains,
            userCategories: aMMCT,
            userVendors: aVend,

            userMMCT: aMMCT,
            mmctFieldsByCat: mmctFieldsByCat,

            UserInfosMMCT: oData.UserInfosMMCT?.results || [],
            UserInfosVend: oData.UserInfosVend?.results || [],
            UserInfosDomains: oData.UserInfosDomains?.results || [],

            domainsByName: domainsByName,
            domainsByKey: domainsByKey,

            // preserva cfg/cache se già presenti
            mdcCfg: oVm.getProperty("/mdcCfg") || {},
            cache: oVm.getProperty("/cache") || { dataRowsByKey: {}, recordsByKey: {} }
          }, true);

        }.bind(this),
        error: function (oError) {
          BusyIndicator.hide();
          console.error("Errore lettura UserInfosSet('" + sUserId + "')", oError);
        }
      });
    },

    onPressFlowA: function () {
      this.getOwnerComponent().getRouter().navTo("Screen1", { mode: "A" });
    },

    onPressFlowB: function () {
      this.getOwnerComponent().getRouter().navTo("Screen1", { mode: "M" });
    },

    onPressFlowC: function () {
      this.getOwnerComponent().getRouter().navTo("Screen1", { mode: "T" });
    }
  });
});
