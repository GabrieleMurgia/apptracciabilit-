sap.ui.define([
  "sap/ui/model/json/JSONModel"
], function (JSONModel) {
  "use strict";

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  function toUpper(v) {
    return String(v == null ? "" : v).trim().toUpperCase();
  }

  function toNumber(v) {
    var n = Number(v);
    return isNaN(n) ? 0 : n;
  }

  function normalizeVendor10(v) {
    var s = String(v == null ? "" : v).trim();
    if (/^\d+$/.test(s) && s.length < 10) {
      return ("0000000000" + s).slice(-10);
    }
    return s;
  }

  function findByGuidAndFibra(aRows, oLine) {
    var sGuid = String((oLine && oLine.Guid) || "").trim();
    var sFibra = String((oLine && (oLine.Fibra || oLine.FIBRA)) || "").trim();
    return (aRows || []).find(function (row) {
      var rowGuid = String((row && row.Guid) || "").trim();
      var rowFibra = String((row && (row.Fibra || row.FIBRA)) || "").trim();
      if (!sGuid || rowGuid !== sGuid) return false;
      if (!sFibra) return true;
      return rowFibra === sFibra;
    }) || null;
  }

  function applyStatusCounters(oRow, sStatus) {
    var sNorm = toUpper(sStatus || oRow.Stato || "ST");
    oRow.Stato = sNorm || "ST";
    oRow.Approved = (sNorm === "AP") ? 1 : 0;
    oRow.Rejected = (sNorm === "RJ") ? 1 : 0;
    oRow.ToApprove = (sNorm === "ST" || sNorm === "CH") ? 1 : 0;
    oRow.Open = "X";
    return oRow;
  }

  function getPathWithoutQuery(sPath) {
    return String(sPath || "").split("?")[0];
  }

  function decodeQuoted(sVal) {
    return decodeURIComponent(String(sVal || "").replace(/''/g, "'"));
  }

  function matchFilter(oItem, oFilter) {
    if (!oFilter) return true;
    if (Array.isArray(oFilter.aFilters) && oFilter.aFilters.length) {
      if (oFilter.bAnd === false) {
        return oFilter.aFilters.some(function (f) { return matchFilter(oItem, f); });
      }
      return oFilter.aFilters.every(function (f) { return matchFilter(oItem, f); });
    }

    var sPath = String(oFilter.sPath || "");
    var sOperator = String(oFilter.sOperator || "");
    var vLeft = oItem ? oItem[sPath] : undefined;
    var vRight = oFilter.oValue1;

    if (sOperator === "Contains") {
      return String(vLeft == null ? "" : vLeft).toUpperCase().indexOf(String(vRight == null ? "" : vRight).toUpperCase()) >= 0;
    }
    if (sOperator === "GT") {
      return toNumber(vLeft) > toNumber(vRight);
    }
    return String(vLeft == null ? "" : vLeft) === String(vRight == null ? "" : vRight);
  }

  function applyFilters(aRows, aFilters) {
    if (!Array.isArray(aFilters) || !aFilters.length) return clone(aRows || []);
    return (aRows || []).filter(function (row) {
      return aFilters.every(function (f) { return matchFilter(row, f); });
    }).map(clone);
  }

  return JSONModel.extend("apptracciabilita.apptracciabilita.test.integration.arrangements.IntegrationODataModel", {
    constructor: function (oState) {
      JSONModel.apply(this, arguments);
      this._state = oState;
      this._headers = {};
      this.sServiceUrl = "/sap/opu/odata/sap/ZVEND_TRACE_SRV";
      this._metadataPromise = Promise.resolve({});
    },

    metadataLoaded: function () {
      return this._metadataPromise;
    },

    attachMetadataFailed: function () {},
    attachRequestFailed: function () {},

    getServiceMetadata: function () {
      return {};
    },

    setHeaders: function (mHeaders) {
      this._headers = Object.assign({}, this._headers, mHeaders || {});
    },

    createKey: function (sSetName, mKeys) {
      var aParts = Object.keys(mKeys || {}).map(function (sKey) {
        return sKey + "='" + encodeURIComponent(String(mKeys[sKey] == null ? "" : mKeys[sKey])).replace(/'/g, "''") + "'";
      });
      return sSetName + "(" + aParts.join(",") + ")";
    },

    _async: function (fnResolve, fnReject) {
      setTimeout(function () {
        try {
          fnResolve();
        } catch (e) {
          if (typeof fnReject === "function") fnReject(e);
        }
      }, 0);
    },

    _error: function (opts, sMessage) {
      var oError = {
        message: sMessage || "Unsupported integration backend operation",
        statusCode: 500,
        responseText: sMessage || "Unsupported integration backend operation"
      };
      if (opts && typeof opts.error === "function") opts.error(oError);
    },

    read: function (sPath, opts) {
      var sReadPath = getPathWithoutQuery(sPath);
      var that = this;

      this._async(function () {
        if (sReadPath.indexOf("/UserInfosSet(") === 0) {
          if (typeof opts.success === "function") opts.success(clone(that._state.userInfo));
          return;
        }

        if (sReadPath === "/VendorDataSet") {
          if (typeof opts.success === "function") opts.success({ results: applyFilters(that._state.vendorRows, opts.filters) });
          return;
        }

        if (sReadPath === "/MaterialDataSet") {
          if (typeof opts.success === "function") opts.success({ results: applyFilters(that._state.materialRows, opts.filters) });
          return;
        }

        if (sReadPath === "/DataSet") {
          if (typeof opts.success === "function") opts.success({ results: applyFilters(that._state.dataRows, opts.filters) });
          return;
        }

        if (sReadPath === "/VendorBatchSet") {
          if (typeof opts.success === "function") opts.success({ results: applyFilters(that._state.vendorBatchRows, opts.filters) });
          return;
        }

        if (sReadPath === "/ExcelMaterialListSet") {
          if (typeof opts.success === "function") opts.success({ results: applyFilters(that._state.excelMaterialRows, opts.filters) });
          return;
        }

        if (sReadPath.indexOf("/GetFieldFileSet(") === 0) {
          if (typeof opts.success === "function") {
            opts.success({
              FileName: "Template_CF.xlsx",
              MimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              FileContent: that._state.templateBase64 || ""
            });
          }
          return;
        }

        that._error(opts, "Unsupported read path: " + sReadPath);
      }, function (e) {
        that._error(opts, e && e.message);
      });
    },

    create: function (sPath, oPayload, opts) {
      var sCreatePath = getPathWithoutQuery(sPath);
      var that = this;

      this._async(function () {
        if (sCreatePath === "/MaterialStatusSet") {
          var sVendor = normalizeVendor10(oPayload && oPayload.Fornitore);
          var sMaterial = String(oPayload && oPayload.Materiale || "").trim();
          var sSeason = String(oPayload && oPayload.Stagione || "").trim();
          var sStatus = String(oPayload && oPayload.MatStatus || "").trim();

          var oMaterial = that._state.materialRows.find(function (row) {
            return normalizeVendor10(row.Fornitore) === sVendor &&
              String(row.Materiale || "").trim() === sMaterial &&
              String(row.Stagione || "").trim() === sSeason;
          });

          if (!oMaterial) {
            that._error(opts, "Material not found for MaterialStatusSet");
            return;
          }

          oMaterial.MatStatus = sStatus;
          that._state.materialStatusUpdates.push(clone(oPayload));
          if (typeof opts.success === "function") opts.success(clone(oMaterial));
          return;
        }

        if (sCreatePath === "/MassMaterialStatusSet") {
          that._state.massMaterialStatusUpdates.push(clone(oPayload));
          if (typeof opts.success === "function") opts.success({});
          return;
        }

        if (sCreatePath === "/CheckDataSet") {
          var aCheckLines = (oPayload && oPayload.PostDataCollection) || [];
          that._state.screen6Checks.push(clone(aCheckLines));
          if (typeof opts.success === "function") {
            opts.success({
              PostDataCollection: {
                results: aCheckLines.map(function () {
                  return { Esito: "S", Message: "OK" };
                })
              }
            });
          }
          return;
        }

        if (sCreatePath === "/PostDataSet") {
          var aLines = ((oPayload && oPayload.PostDataCollection) || []).map(clone);
          aLines.forEach(function (line) {
            var sCodAgg = toUpper(line.CodAgg);
            var oExisting = findByGuidAndFibra(that._state.dataRows, line);

            if (sCodAgg === "D") {
              that._state.dataRows = that._state.dataRows.filter(function (row) {
                if (!oExisting) return true;
                return row !== oExisting;
              });
              return;
            }

            if (!oExisting) {
              oExisting = {
                Guid: String(line.Guid || "").trim(),
                Fibra: String(line.Fibra || "").trim()
              };
              that._state.dataRows.push(oExisting);
            }

            Object.keys(line || {}).forEach(function (sKey) {
              oExisting[sKey] = line[sKey];
            });
            if (!oExisting.CatMateriale) oExisting.CatMateriale = that._state.defaultCat;
            if (!oExisting.Fornitore) oExisting.Fornitore = that._state.defaultVendor;
            if (!oExisting.Materiale) oExisting.Materiale = that._state.defaultMaterial;
            if (!oExisting.Stagione) oExisting.Stagione = that._state.defaultSeason;
            if (!oExisting.DescMat) oExisting.DescMat = that._state.defaultMaterialDescription;
            if (!oExisting.RagSoc) oExisting.RagSoc = that._state.defaultVendorName;
            if (!oExisting.OnlySaved) oExisting.OnlySaved = "X";
            applyStatusCounters(oExisting, oExisting.Stato || "ST");
          });

          if (aLines.some(function (line) {
            return String(line.Materiale || "").trim() !== that._state.defaultMaterial;
          })) {
            that._state.screen6Posts.push(clone(aLines));
          } else {
            that._state.screen34Posts.push(clone(aLines));
          }

          if (typeof opts.success === "function") {
            opts.success({
              PostDataCollection: {
                results: aLines.map(function () {
                  return { Esito: "OK", Message: "OK" };
                })
              }
            });
          }
          return;
        }

        that._error(opts, "Unsupported create path: " + sCreatePath);
      }, function (e) {
        that._error(opts, e && e.message);
      });
    }
  });
});
