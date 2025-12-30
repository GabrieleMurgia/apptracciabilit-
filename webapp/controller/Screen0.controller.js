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
      userMMCT: [],
      mmctFieldsByCat: {}      
      });
      oComponent.setModel(oVm, "vm");


  

      var oModel  = oComponent.getModel(); 
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
          var aMMCT    = (oData.UserInfosMMCT    && oData.UserInfosMMCT.results)    || [];
          var aVend    = (oData.UserInfosVend    && oData.UserInfosVend.results)    || [];

var domainsByName = aDomains.reduce(function (acc, d) {
  var sDom = d.Domain;
  acc[sDom] = ((d.DomainsValues && d.DomainsValues.results) || []).map(function (x) {
    var v = x.Value;
    return { key: v, text: v };
  });
  return acc;
}, {});

var mmctFieldsByCat = aMMCT.reduce(function (acc, cat) {
  acc[cat.CatMateriale] = ((cat.UserMMCTFields && cat.UserMMCTFields.results) || []);
  return acc;
}, {});
          
          oVm.setData({
            userId: sUserId,
            userType: sUserType,
            showAggregatedTile: sUserType !== "E",
            userCategories: oData.UserInfosMMCT && oData.UserInfosMMCT.results || [],
            userVendors:  oData.UserInfosVend  && oData.UserInfosVend.results  || [],
            userDomains: aDomains,
            userCategories: aMMCT,
            userVendors: aVend,
            userMMCT: aMMCT,
            mmctFieldsByCat: mmctFieldsByCat,
            UserInfosMMCT: oData.UserInfosMMCT?.results || [],
            UserInfosVend:    oData.UserInfosVend?.results  || [],
            UserInfosDomains:    oData.UserInfosDomains?.results || [],  
              domainsByName: domainsByName,        // ✅
          });

          

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
