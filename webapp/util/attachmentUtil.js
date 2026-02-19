/**
 * attachmentUtil.js — Centralized attachment management.
 *
 * Provides:
 * - List attachments (by Guid + FieldName)
 * - Download attachment (placeholder for endpoint TBD)
 * - Delete attachment (placeholder for endpoint TBD)
 * - Upload attachment (placeholder for endpoint TBD)
 * - Open reusable attachment dialog
 * - Base64 Guid ↔ OData guid format conversion
 *
 * Usage from cellTemplateUtil:
 *   AttachmentUtil.openAttachmentDialog({ oModel, guid, fieldName, oView });
 */
sap.ui.define([
  "sap/m/Dialog",
  "sap/m/Button",
  "sap/m/List",
  "sap/m/CustomListItem",
  "sap/m/HBox",
  "sap/m/VBox",
  "sap/m/Text",
  "sap/m/Link",
  "sap/m/Label",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "sap/m/BusyIndicator",
  "sap/ui/core/BusyIndicator",
  "sap/ui/model/json/JSONModel"
], function (
  Dialog, Button, List, CustomListItem,
  HBox, VBox, Text, Link, Label,
  MessageToast, MessageBox, MBusyIndicator, BusyIndicator, JSONModel
) {
  "use strict";

  // ==================== GUID CONVERSION ====================

  /**
   * Convert a base64-encoded binary GUID to OData guid format:
   *   "h5Gvm75p/LkpitRRvn0FfA==" → "8791af9b-be69-fcb9-29aa-d451be7d057c"
   *
   * @param {string} sBase64 - Base64 encoded GUID (16 bytes)
   * @returns {string} UUID in dashed format, or empty string if invalid
   */
  function base64ToGuidDashed(sBase64) {
    try {
      if (!sBase64) return "";
      // Already in dashed format?
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(sBase64)) return sBase64.toLowerCase();

      var bin = atob(sBase64);
      if (bin.length !== 16) return sBase64; // not a 16-byte GUID

      var hex = "";
      for (var i = 0; i < bin.length; i++) {
        hex += ("0" + bin.charCodeAt(i).toString(16)).slice(-2);
      }
      // Format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      return (
        hex.substr(0, 8) + "-" +
        hex.substr(8, 4) + "-" +
        hex.substr(12, 4) + "-" +
        hex.substr(16, 4) + "-" +
        hex.substr(20, 12)
      ).toLowerCase();
    } catch (e) {
      console.warn("[AttachmentUtil] base64ToGuidDashed error", e);
      return sBase64 || "";
    }
  }

  /**
   * Format a GUID for use in OData $filter:
   *   → "guid'8791af9b-be69-fcb9-29aa-d451be7d057c'"
   */
  function guidForODataFilter(sBase64) {
    var sDashed = base64ToGuidDashed(sBase64);
    if (!sDashed) return "";
    return "guid'" + sDashed + "'";
  }

  // ==================== ODATA CALLS ====================

  /**
   * List attachments for a given Guid + FieldName.
   *
   * @param {object} opts
   * @param {sap.ui.model.odata.v2.ODataModel} opts.oModel - OData model
   * @param {string} opts.guid - GUID (base64 or dashed format)
   * @param {string} opts.fieldName - Field name (e.g. "Attachment", "CertMatAb")
   * @param {boolean} [opts.mock] - If true, return mock data
   * @returns {Promise<object[]>} Array of { Guid, FieldName, FileName, Note }
   */
  function listAttachments(opts) {
    var oModel = opts.oModel;
    var sGuid = opts.guid;
    var sFieldName = opts.fieldName || "";

    if (opts.mock) {
      return Promise.resolve([
        { Guid: sGuid, FieldName: sFieldName, FileName: "mock_document.pdf", Note: "Mock file 1" },
        { Guid: sGuid, FieldName: sFieldName, FileName: "mock_report.xlsx", Note: "Mock file 2" }
      ]);
    }

    var sGuidDashed = base64ToGuidDashed(sGuid);
    if (!sGuidDashed) return Promise.reject("GUID non valido");

    // Build $filter manually to avoid sap.ui.model.Filter double-wrapping guid values
    var sFilter = "Guid eq guid'" + sGuidDashed + "' and FieldName eq '" + sFieldName + "'";

    return new Promise(function (resolve, reject) {
      oModel.read("/zget_attachment_list", {
        urlParameters: { "$format": "json", "$filter": sFilter },
        success: function (oData) {
          var aResults = (oData && oData.results) || [];
          resolve(aResults);
        },
        error: function (oError) {
          console.error("[AttachmentUtil] listAttachments error", oError);
          reject(oError);
        }
      });
    });
  }

  /**
   * Download an attachment.
   * Reads the AttachmentSet entity to get FileContent (base64), then triggers browser download.
   * Endpoint: /AttachmentSet(Guid=guid'...',FieldName='...',FileName='...')
   */
  function downloadAttachment(opts) {
    var oModel = opts.oModel;
    var sGuid = opts.guid;
    var sFieldName = opts.fieldName || "";
    var sFileName = opts.fileName || "";

    var sGuidDashed = base64ToGuidDashed(sGuid);
    var sPath = "/AttachmentSet(Guid=guid'" + sGuidDashed +
      "',FieldName='" + encodeURIComponent(sFieldName) +
      "',FileName='" + encodeURIComponent(sFileName) + "')";

    if (!oModel || typeof oModel.read !== "function") {
      // Fallback: open URL directly (for cases where OData model is unavailable)
      var sServiceUrl = (oModel && oModel.sServiceUrl) || "/sap/opu/odata/sap/ZVEND_TRACE_SRV";
      sap.m.URLHelper.redirect(sServiceUrl + sPath + "?$format=json", true);
      return;
    }

    sap.ui.core.BusyIndicator.show(0);
    
    oModel.read(sPath, {
      urlParameters: { "$format": "json" },
      success: function (oData) {
        sap.ui.core.BusyIndicator.hide();
        if (!oData) {
          MessageToast.show("Nessun dato ricevuto per l'allegato");
          return;
        }

        
        var sContent = oData.FileContent || "";
        var sMimeType = oData.MimeType || "application/octet-stream";
        var sName = oData.FileName || sFileName || "download";

        if (!sContent) {
          MessageToast.show("Il file non contiene dati");
          return;
        }

        // Decode base64 and trigger download
        try {
          var byteChars = atob(sContent);
          var byteNumbers = new Array(byteChars.length);
          for (var i = 0; i < byteChars.length; i++) {
            byteNumbers[i] = byteChars.charCodeAt(i);
          }
          var byteArray = new Uint8Array(byteNumbers);
          var oBlob = new Blob([byteArray], { type: sMimeType });

          // Create download link
          var sUrl = URL.createObjectURL(oBlob);
          var oLink = document.createElement("a");
          oLink.href = sUrl;
          oLink.download = sName;
          document.body.appendChild(oLink);
          oLink.click();
          document.body.removeChild(oLink);
          setTimeout(function () { URL.revokeObjectURL(sUrl); }, 5000);
        } catch (e) {
          console.error("[AttachmentUtil] download decode error", e);
          MessageToast.show("Errore durante il download del file");
        }
      },
      error: function (oError) {
        sap.ui.core.BusyIndicator.hide();
        console.error("[AttachmentUtil] downloadAttachment error", oError);
        MessageToast.show("Errore durante il download dell'allegato");
      }
    });
  }

  /**
   * Upload an attachment via POST to AttachmentSet.
   *
   * @param {object} opts
   * @param {sap.ui.model.odata.v2.ODataModel} opts.oModel
   * @param {string} opts.guid - GUID (base64 or dashed)
   * @param {string} opts.fieldName
   * @param {string} opts.fileName
   * @param {string} opts.mimeType
   * @param {string} opts.fileContent - Base64 encoded file content
   * @param {string} [opts.note]
   * @returns {Promise}
   */
  function uploadAttachment(opts) {
    var oModel = opts.oModel;
    if (!oModel) return Promise.reject("No OData model");

    var sGuidDashed = base64ToGuidDashed(opts.guid);
    var oPayload = {
      Guid: sGuidDashed,
      FieldName: opts.fieldName || "",
      FileName: opts.fileName || "",
      MimeType: opts.mimeType || "application/octet-stream",
      FileContent: opts.fileContent || "",
      Note: opts.note || ""
    };

    return new Promise(function (resolve, reject) {
      oModel.create("/AttachmentSet", oPayload, {
        success: function (oData) {
          MessageToast.show("Allegato caricato: " + (opts.fileName || ""));
          resolve(oData);
        },
        error: function (oError) {
          console.error("[AttachmentUtil] uploadAttachment error", oError);
          MessageBox.error("Errore durante il caricamento dell'allegato.");
          reject(oError);
        }
      });
    });
  }

  /**
   * Delete an attachment via DELETE on AttachmentSet.
   */
  function deleteAttachment(opts) {
    var oModel = opts.oModel;
    if (!oModel) return Promise.reject("No OData model");

    var sGuidDashed = base64ToGuidDashed(opts.guid);
    var sPath = "/AttachmentSet(Guid=guid'" + sGuidDashed +
      "',FieldName='" + encodeURIComponent(opts.fieldName || "") +
      "',FileName='" + encodeURIComponent(opts.fileName || "") + "')";

    return new Promise(function (resolve, reject) {
      oModel.remove(sPath, {
        success: function () {
          MessageToast.show("Allegato eliminato: " + (opts.fileName || ""));
          resolve();
        },
        error: function (oError) {
          console.error("[AttachmentUtil] deleteAttachment error", oError);
          MessageBox.error("Errore durante l'eliminazione dell'allegato.");
          reject(oError);
        }
      });
    });
  }

  // ==================== FILE ICON HELPER ====================

  function getFileIcon(sFileName) {
    var ext = String(sFileName || "").split(".").pop().toLowerCase();
    var map = {
      pdf: "sap-icon://pdf-attachment",
      xlsx: "sap-icon://excel-attachment",
      xls: "sap-icon://excel-attachment",
      docx: "sap-icon://doc-attachment",
      doc: "sap-icon://doc-attachment",
      pptx: "sap-icon://ppt-attachment",
      ppt: "sap-icon://ppt-attachment",
      jpg: "sap-icon://attachment-photo",
      jpeg: "sap-icon://attachment-photo",
      png: "sap-icon://attachment-photo",
      gif: "sap-icon://attachment-photo",
      zip: "sap-icon://attachment-zip-file",
      rar: "sap-icon://attachment-zip-file",
      txt: "sap-icon://attachment-text-file",
      csv: "sap-icon://attachment-text-file"
    };
    return map[ext] || "sap-icon://document";
  }

  // ==================== DIALOG ====================

  /**
   * Open attachment management dialog.
   *
   * @param {object} opts
   * @param {sap.ui.model.odata.v2.ODataModel} opts.oModel - OData model
   * @param {string} opts.guid - GUID (base64)
   * @param {string} opts.fieldName - Field name for attachment scope
   * @param {string} [opts.fieldLabel] - Human-readable label for the field
   * @param {sap.ui.core.mvc.View} [opts.oView] - View (for addDependent)
   * @param {boolean} [opts.mock] - Mock mode
   * @param {boolean} [opts.readOnly] - If true, hide upload/delete
   */
  function openAttachmentDialog(opts) {
    var oModel = opts.oModel;
    var sGuid = opts.guid || "";
    var sFieldName = opts.fieldName || "";
    var sLabel = opts.fieldLabel || sFieldName || "Allegati";
    var bReadOnly = !!opts.readOnly;
    var bMock = !!opts.mock;

    if (!sGuid) {
      MessageToast.show("GUID mancante, impossibile caricare gli allegati");
      return;
    }

    // Dialog model for attachment list
    var oDialogModel = new JSONModel({
      attachments: [],
      loading: true,
      fieldLabel: sLabel,
      fieldName: sFieldName,
      guid: sGuid,
      count: 0,
      readOnly: bReadOnly
    });

    // Helper: reload attachment list into dialog model
    function _reloadList() {
      oDialogModel.setProperty("/loading", true);
      listAttachments({ oModel: oModel, guid: sGuid, fieldName: sFieldName, mock: bMock })
        .then(function (aList) {
          oDialogModel.setProperty("/attachments", aList || []);
          oDialogModel.setProperty("/count", (aList || []).length);
          oDialogModel.setProperty("/loading", false);
        })
        .catch(function () {
          oDialogModel.setProperty("/loading", false);
        });
    }

    // Build list items with delete button
    var oList = new List({
      noDataText: "Nessun allegato trovato",
      items: {
        path: "dlg>/attachments",
        template: new CustomListItem({
          content: [
            new HBox({
              alignItems: "Center",
              width: "100%",
              items: [
                new sap.ui.core.Icon({
                  src: {
                    path: "dlg>FileName",
                    formatter: function (fn) { return getFileIcon(fn); }
                  },
                  size: "1.5rem",
                  color: "#0854a0"
                }).addStyleClass("sapUiSmallMarginEnd"),
                new VBox({
                  layoutData: new sap.m.FlexItemData({ growFactor: 1 }),
                  items: [
                    new Link({
                      text: "{dlg>FileName}",
                      press: function (oEvt) {
                        var oCtx = oEvt.getSource().getBindingContext("dlg");
                        if (!oCtx) return;
                        var oAtt = oCtx.getObject();
                        downloadAttachment({
                          oModel: oModel,
                          guid: sGuid,
                          fieldName: oAtt.FieldName || sFieldName,
                          fileName: oAtt.FileName
                        });
                      }
                    }),
                    new Text({
                      text: "{dlg>Note}",
                      visible: "{= !!${dlg>Note} }"
                    }).addStyleClass("sapUiTinyMarginTop sapThemeMetaText")
                  ]
                }).addStyleClass("sapUiSmallMarginBegin"),
                // Delete button (only if not readOnly)
                new Button({
                  icon: "sap-icon://delete",
                  type: "Transparent",
                  visible: !bReadOnly,
                  tooltip: "Elimina allegato",
                  press: function (oEvt) {
                    var oCtx = oEvt.getSource().getBindingContext("dlg");
                    if (!oCtx) return;
                    var oAtt = oCtx.getObject();
                    MessageBox.confirm(
                      "Eliminare \"" + (oAtt.FileName || "") + "\"?",
                      {
                        onClose: function (sAction) {
                          if (sAction !== MessageBox.Action.OK) return;
                          deleteAttachment({
                            oModel: oModel,
                            guid: sGuid,
                            fieldName: oAtt.FieldName || sFieldName,
                            fileName: oAtt.FileName
                          }).then(function () { _reloadList(); });
                        }
                      }
                    );
                  }
                })
              ]
            }).addStyleClass("sapUiSmallMarginTopBottom attachmentDialogItem")
          ]
        })
      }
    });

    // Hidden file input for upload
    var oFileInput = document.createElement("input");
    oFileInput.type = "file";
    oFileInput.style.display = "none";
    document.body.appendChild(oFileInput);

    oFileInput.addEventListener("change", function () {
      var oFile = oFileInput.files && oFileInput.files[0];
      if (!oFile) return;
      var reader = new FileReader();
      reader.onload = function () {
        var sBase64 = reader.result.split(",")[1] || "";
        uploadAttachment({
          oModel: oModel,
          guid: sGuid,
          fieldName: sFieldName,
          fileName: oFile.name,
          mimeType: oFile.type || "application/octet-stream",
          fileContent: sBase64,
          note: ""
        }).then(function () { _reloadList(); });
      };
      reader.readAsDataURL(oFile);
      // Reset so same file can be re-selected
      oFileInput.value = "";
    });

    // Build dialog
    var aCustomButtons = [];
    if (!bReadOnly) {
      aCustomButtons.push(new Button({
        text: "Carica allegato",
        icon: "sap-icon://upload",
        type: "Emphasized",
        press: function () {
          oFileInput.click();
        }
      }));
    }

    var oDialog = new Dialog({
      title: "Allegati — " + sLabel,
      contentWidth: "550px",
      resizable: true,
      draggable: true,
      content: [oList],
      buttons: aCustomButtons.concat([
        new Button({
          text: "Chiudi",
          press: function () {
            oDialog.close();
          }
        })
      ]),
      afterClose: function () {
        // Clean up hidden file input
        try { document.body.removeChild(oFileInput); } catch (e) {}
        oDialog.destroy();
      }
    });

    oDialog.setModel(oDialogModel, "dlg");

    if (opts.oView) {
      opts.oView.addDependent(oDialog);
    }

    oDialog.open();

    // Load attachments
    _reloadList();
  }

  // ==================== PUBLIC API ====================

  return {
    base64ToGuidDashed: base64ToGuidDashed,
    guidForODataFilter: guidForODataFilter,
    listAttachments: listAttachments,
    downloadAttachment: downloadAttachment,
    uploadAttachment: uploadAttachment,
    deleteAttachment: deleteAttachment,
    openAttachmentDialog: openAttachmentDialog,
    getFileIcon: getFileIcon
  };
});