/**
 * attachmentCellTemplate.js — Cell template per colonne Attachment (flag "A")
 * e Download/Questionnaire (flag "D").
 *
 * Estratto da cellTemplateUtil.js per ridurne la dimensione.
 */
sap.ui.define([
  "sap/m/HBox",
  "sap/m/Button",
  "sap/m/MessageBox",
  "apptracciabilita/apptracciabilita/util/vmModelPaths",
  "apptracciabilita/apptracciabilita/util/attachmentUtil",
  "apptracciabilita/apptracciabilita/util/i18nUtil"
], function (HBox, Button, MessageBox, VmPaths, AttachmentUtil, I18n) {
  "use strict";

  function createAttachmentCellTemplate(sKey, oMeta, opts) {
    var sLabel = (oMeta && oMeta.label) || sKey;

    var oBtn = new Button({
      icon: "sap-icon://attachment",
      enabled: {
        parts: [
          { path: "detail>guidKey" },
          { path: "detail>Guid" },
          { path: "detail>GUID" },
          { path: "detail>__isNew" }
        ],
        formatter: function (sGuidKey, sGuid, sGUID, bIsNew) {
          var g = String(sGuidKey || sGuid || sGUID || "").trim();
          if (!g) return false;
          if (g.indexOf("NEW_") >= 0) return false;
          if (g.indexOf("SYNTH_") >= 0) return false;
          if (g.indexOf("-new") >= 0) return false;
          if (bIsNew === true) return false;
          return true;
        }
      },
      text: {
        path: "detail>" + sKey,
        formatter: function (v) {
          var n = parseInt(v, 10);
          if (isNaN(n) || n <= 0) return "0";
          return String(n);
        }
      },
      tooltip: {
        parts: [
          { path: "detail>" + sKey },
          { path: "detail>guidKey" },
          { path: "detail>Guid" },
          { path: "detail>GUID" },
          { path: "detail>__isNew" }
        ],
        formatter: function (v, sGuidKey, sGuid, sGUID, bIsNew) {
          var g = String(sGuidKey || sGuid || sGUID || "").trim();
          var bUnsaved = !g ||
            g.indexOf("NEW_") >= 0 ||
            g.indexOf("SYNTH_") >= 0 ||
            g.indexOf("-new") >= 0 ||
            bIsNew === true;
          if (bUnsaved) {
            return sLabel + " — Salva il record prima di caricare allegati";
          }
          var n = parseInt(v, 10);
          if (isNaN(n) || n <= 0) return sLabel + " — Nessun allegato";
          return sLabel + " — " + n + " allegat" + (n === 1 ? "o" : "i");
        }
      },
      type: {
        path: "detail>" + sKey,
        formatter: function (v) {
          var n = parseInt(v, 10);
          return (n > 0) ? "Emphasized" : "Transparent";
        }
      },
      press: function (oEvt) {
        var oSrc = oEvt.getSource();
        var oCtx = oSrc.getBindingContext("detail");
        if (!oCtx) return;
        var oRow = oCtx.getObject();
        var sGuid = String((oRow && (oRow.guidKey || oRow.Guid || oRow.GUID)) || "").trim();
        if (!sGuid) {
          sap.m.MessageToast.show(I18n.text(null, "msg.guidMissing", [], "GUID mancante"));
          return;
        }

        var oView = opts.view || null;
        var oComponent = oView && oView.getController && oView.getController().getOwnerComponent && oView.getController().getOwnerComponent();
        var oODataModel = oComponent && oComponent.getModel();
        var oVm = oComponent && oComponent.getModel("vm");
        var bReadOnly = !!(oRow && oRow.__readOnly);

        var sRowGuid = sGuid;
        var oDetailModel = oCtx.getModel();

        var sCurrentStato = String((oRow && (oRow.Stato || oRow.__status || "")) || "").trim();

        AttachmentUtil.openAttachmentDialog({
          oModel: oODataModel,
          guid: sGuid,
          fieldName: sKey,
          fieldLabel: sLabel,
          oView: oView,
          readOnly: bReadOnly,
          currentStato: sCurrentStato,
          onStatusChange: function (sNewStato, oData) {
            var sStUpper = String(sNewStato || "").trim().toUpperCase();
            if (!sStUpper) return;

            try {
              if (oDetailModel) {
                ["/RecordsAll", "/Records", "/RowsAll", "/Rows"].forEach(function (sArrPath) {
                  var aArr = oDetailModel.getProperty(sArrPath) || [];
                  for (var i = 0; i < aArr.length; i++) {
                    var r = aArr[i];
                    if (r && String(r.guidKey || r.Guid || r.GUID || "") === sRowGuid) {
                      r.Stato = sStUpper;
                      r.__status = sStUpper;
                      if (sStUpper === "U" || sStUpper === "ST" || sStUpper === "CH") {
                        r.__readOnly = false;
                      }
                      oDetailModel.setProperty(sArrPath + "/" + i + "/Stato", sStUpper);
                      oDetailModel.setProperty(sArrPath + "/" + i + "/__status", sStUpper);
                      break;
                    }
                  }
                });
                oDetailModel.refresh(true);
              }
            } catch (e) {
              console.warn("[attachmentCellTemplate] onStatusChange model update error", e);
            }

            try {
              if (oVm) {
                var oCache = oVm.getProperty("/cache") || {};
                var oRecordsByKey = oCache.recordsByKey || {};
                Object.keys(oRecordsByKey).forEach(function (sCK) {
                  var aRecs = oRecordsByKey[sCK] || [];
                  if (!Array.isArray(aRecs)) return;
                  var bChanged = false;
                  for (var i = 0; i < aRecs.length; i++) {
                    var r = aRecs[i];
                    if (r && String(r.guidKey || r.Guid || r.GUID || "") === sRowGuid) {
                      r.Stato = sStUpper;
                      r.__status = sStUpper;
                      if (sStUpper === "U" || sStUpper === "ST" || sStUpper === "CH") {
                        r.__readOnly = false;
                      }
                      bChanged = true;
                    }
                  }
                  if (bChanged) {
                    oVm.setProperty(VmPaths.recordsByKeyPath(sCK), aRecs);
                  }
                });

                var oDataRowsByKey = oCache.dataRowsByKey || {};
                Object.keys(oDataRowsByKey).forEach(function (sCK) {
                  var aRows = oDataRowsByKey[sCK] || [];
                  if (!Array.isArray(aRows)) return;
                  var bChanged = false;
                  for (var i = 0; i < aRows.length; i++) {
                    var r = aRows[i];
                    if (r && String(r.guidKey || r.Guid || r.GUID || "") === sRowGuid) {
                      r.Stato = sStUpper;
                      r.__status = sStUpper;
                      if (sStUpper === "U" || sStUpper === "ST" || sStUpper === "CH") {
                        r.__readOnly = false;
                      }
                      bChanged = true;
                    }
                  }
                  if (bChanged) {
                    oVm.setProperty(VmPaths.dataRowsByKeyPath(sCK), aRows);
                  }
                });
              }
            } catch (eVm) {
              console.warn("[attachmentCellTemplate] onStatusChange VM cache update error", eVm);
            }

            try {
              var oController = oView && oView.getController && oView.getController();
              if (oController && sRowGuid) {
                [oController._originalSnapshot, oController._snapshotRecords, oController._snapshotRows].forEach(function (aSnap) {
                  if (!Array.isArray(aSnap)) return;
                  for (var i = 0; i < aSnap.length; i++) {
                    var r = aSnap[i];
                    if (r && String(r.guidKey || r.Guid || r.GUID || "") === sRowGuid) {
                      r.Stato = sStUpper;
                      r.__status = sStUpper;
                      break;
                    }
                  }
                });
              }
            } catch (e2) {
              console.warn("[attachmentCellTemplate] onStatusChange snapshot sync error", e2);
            }
          },
          onCountChange: function (iNewCount) {
            var sVal = String(iNewCount);
            try {
              if (!oDetailModel) return;
              ["/RecordsAll", "/Records", "/RowsAll", "/Rows"].forEach(function (sArrPath) {
                var aArr = oDetailModel.getProperty(sArrPath) || [];
                for (var i = 0; i < aArr.length; i++) {
                  var r = aArr[i];
                  if (r && String(r.guidKey || r.Guid || r.GUID || "") === sRowGuid) {
                    r[sKey] = sVal;
                    oDetailModel.setProperty(sArrPath + "/" + i + "/" + sKey, sVal);
                    break;
                  }
                }
              });
              oDetailModel.refresh(true);
            } catch (e) {
              console.warn("[attachmentCellTemplate] onCountChange model update error", e);
            }
            try {
              var oController = oView && oView.getController && oView.getController();
              if (oController && sRowGuid) {
                [oController._originalSnapshot, oController._snapshotRecords, oController._snapshotRows].forEach(function (aSnap) {
                  if (!Array.isArray(aSnap)) return;
                  for (var i = 0; i < aSnap.length; i++) {
                    var r = aSnap[i];
                    if (r && String(r.guidKey || r.Guid || r.GUID || "") === sRowGuid) {
                      r[sKey] = sVal;
                      break;
                    }
                  }
                });
              }
            } catch (e2) {
              console.warn("[attachmentCellTemplate] onCountChange snapshot sync error", e2);
            }
          }
        });
      }
    });

    return new HBox({
      width: "100%",
      justifyContent: "Center",
      alignItems: "Center",
      items: [oBtn]
    });
  }

  function createDownloadCellTemplate(sKey, oMeta, opts) {
    var oBtn = new Button({
      icon: "sap-icon://download",
      text: "{detail>" + sKey + "}",
      type: "Transparent",
      enabled: {
        path: "detail>" + sKey,
        formatter: function (v) { return !!(v && String(v).trim()); }
      },
      tooltip: {
        path: "detail>" + sKey,
        formatter: function (v) {
          var s = (v && String(v).trim()) || "";
          return s ? "Scarica questionario: " + s : "Nessun questionario";
        }
      },
      press: function (oEvt) {
        var oSrc = oEvt.getSource();
        var oCtx = oSrc.getBindingContext("detail");
        var sFieldValue = "";
        if (oCtx) {
          sFieldValue = String(oCtx.getProperty(sKey) || "").trim();
        }
        if (!sFieldValue) {
          MessageBox.warning(I18n.text(null, "msg.noValueForField", [sKey], "Nessun valore per il campo {0}"));
          return;
        }

        var oODataModel = null;
        try {
          var oView = opts.view;
          if (oView && oView.getModel) {
            oODataModel = oView.getModel();
          }
          if (!oODataModel && oView && oView.getController) {
            oODataModel = oView.getController().getOwnerComponent().getModel();
          }
        } catch (e) {
          console.error("[attachmentCellTemplate] Cannot get OData model", e);
        }

        if (!oODataModel) {
          MessageBox.error(I18n.text(null, "msg.odataModelUnavailable", [], "Modello OData non disponibile"));
          return;
        }

        var sPath = "/" + oODataModel.createKey("GetFieldFileSet", {
          FieldName: sKey,
          FieldValue: sFieldValue
        });

        sap.ui.core.BusyIndicator.show(0);
        oODataModel.read(sPath, {
          groupId: "$direct",
          success: function (oData) {
            sap.ui.core.BusyIndicator.hide();

            var sContent = oData && oData.FileContent;
            var sFileName = (oData && oData.FileName) || (sKey + "_" + sFieldValue);
            var sMimeType = (oData && oData.MimeType) || "application/octet-stream";

            if (!sContent) {
              MessageBox.warning(I18n.text(null, "msg.noFileAvailableForValue", [sFieldValue], "Nessun file disponibile per \"{0}\""));
              return;
            }

            try {
              var byteChars = atob(sContent);
              var byteNumbers = new Array(byteChars.length);
              for (var i = 0; i < byteChars.length; i++) {
                byteNumbers[i] = byteChars.charCodeAt(i);
              }
              var byteArray = new Uint8Array(byteNumbers);
              var oBlob = new Blob([byteArray], { type: sMimeType });

              var sUrl = URL.createObjectURL(oBlob);
              var oLink = document.createElement("a");
              oLink.href = sUrl;
              oLink.download = sFileName;
              document.body.appendChild(oLink);
              oLink.click();
              document.body.removeChild(oLink);
              URL.revokeObjectURL(sUrl);
            } catch (e) {
              console.error("[attachmentCellTemplate] Download error", e);
              MessageBox.error(I18n.text(null, "msg.fileDownloadError", [], "Errore nel download del file"));
            }
          },
          error: function (oError) {
            sap.ui.core.BusyIndicator.hide();
            console.error("[attachmentCellTemplate] GetFieldFileSet error", oError);
            var sMsg = I18n.text(null, "msg.fileFetchError", [], "Errore nel recupero del file");
            try {
              var oBody = JSON.parse(oError.responseText);
              sMsg = (oBody.error && oBody.error.message && oBody.error.message.value) || sMsg;
            } catch (e) {
              console.debug("[attachmentCellTemplate] suppressed error", e);
            }
            MessageBox.error(sMsg);
          }
        });
      }
    });

    return new HBox({
      width: "100%",
      justifyContent: "Center",
      alignItems: "Center",
      items: [oBtn]
    });
  }

  return {
    createAttachmentCellTemplate: createAttachmentCellTemplate,
    createDownloadCellTemplate: createDownloadCellTemplate
  };
});
