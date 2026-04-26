sap.ui.define([
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "sap/ui/core/BusyIndicator",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "apptracciabilita/apptracciabilita/util/normalize",
  "apptracciabilita/apptracciabilita/util/postUtil",
  "apptracciabilita/apptracciabilita/util/s6ExcelUtil",
  "apptracciabilita/apptracciabilita/util/i18nUtil"
], function (MessageToast, MessageBox, BusyIndicator, Filter, FilterOperator, N, PostUtil, S6Excel, I18n) {
  "use strict";

  function scheduleRowStyleRefresh(fnUpdate) {
    setTimeout(function () { fnUpdate(); }, 1500);
    setTimeout(function () { fnUpdate(); }, 3000);
  }

  return {
    buildCategoriesList: function (opts) {
      var aMMCT = opts.vmModel.getProperty("/userCategories") || opts.vmModel.getProperty("/userMMCT") || opts.vmModel.getProperty("/UserInfosMMCT") || [];
      var aCatList = S6Excel.buildCategoryList(opts.vmModel.getProperty("/mmctFieldsByCat") || {}, aMMCT);
      opts.vmModel.setProperty("/userCategoriesList", aCatList);
    },

    onDownloadTemplate: function (opts) {
      var sCat = opts.getSelectedCatFn();
      if (!sCat) {
        MessageToast.show(I18n.text(null, "msg.selectMaterialCategoryLowercase", [], "Seleziona una categoria materiale"));
        return;
      }

      var oODataModel = opts.odataModel;
      var sPath = "/" + oODataModel.createKey("GetFieldFileSet", {
        FieldName: "ExcelTemplate",
        FieldValue: sCat
      });

      BusyIndicator.show(0);
      oODataModel.read(sPath, {
        success: function (oData) {
          BusyIndicator.hide();

          var sContent = oData && oData.FileContent;
          var sFileName = (oData && oData.FileName) || ("Template_" + sCat + ".xlsx");
          var sMimeType = (oData && oData.MimeType) || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

          if (!sContent) {
            MessageBox.warning(I18n.text(null, "msg.noTemplateForCategory", [sCat], "Nessun template disponibile per la categoria \"{0}\""));
            return;
          }

          try {
            var byteChars = atob(sContent);
            var byteNumbers = new Array(byteChars.length);
            for (var i = 0; i < byteChars.length; i++) {
              byteNumbers[i] = byteChars.charCodeAt(i);
            }
            var oBlob = new Blob([new Uint8Array(byteNumbers)], { type: sMimeType });
            var sUrl = URL.createObjectURL(oBlob);
            var oLink = document.createElement("a");
            oLink.href = sUrl;
            oLink.download = sFileName;
            document.body.appendChild(oLink);
            oLink.click();
            document.body.removeChild(oLink);
            URL.revokeObjectURL(sUrl);
            MessageToast.show(I18n.text(null, "msg.templateDownloaded", [sFileName], "Template scaricato: {0}"));
          } catch (e) {
            console.error("[S6] Download template error", e);
            MessageBox.error(I18n.text(null, "msg.templateDownloadError", [], "Errore nel download del template"));
          }
        },
        error: function (oError) {
          BusyIndicator.hide();
          console.error("[S6] GetFieldFileSet error", oError);
          MessageBox.error(N.getBackendErrorMessage(oError));
        }
      });
    },

    onDownloadMaterialList: function (opts) {
      var sCat = opts.getSelectedCatFn();
      if (!sCat) {
        MessageToast.show(I18n.text(null, "msg.selectMaterialCategoryLowercase", [], "Seleziona una categoria materiale"));
        return;
      }

      BusyIndicator.show(0);
      opts.odataModel.read("/ExcelMaterialListSet", {
        filters: [new Filter("CatMateriale", FilterOperator.EQ, sCat)],
        urlParameters: { "$top": "99999" },
        success: function (oData) {
          var aResults = (oData && oData.results) || [];
          if (!aResults.length) {
            BusyIndicator.hide();
            MessageToast.show(I18n.text(null, "msg.noNewMaterialForCategory", [sCat], "Nessun materiale nuovo trovato per la categoria {0}"));
            return;
          }
          opts.exportMaterialListToExcelFn(aResults, sCat);
        },
        error: function (oError) {
          BusyIndicator.hide();
          console.error("[S6] ExcelMaterialListSet error", oError);
          MessageBox.error(I18n.text(null, "msg.materialListLoadError", [], "Errore nel caricamento della lista materiali"));
        }
      });
    },

    exportMaterialListToExcel: async function (opts) {
      try {
        BusyIndicator.show(0);

        var Spreadsheet;
        var EdmType;
        await new Promise(function (res, rej) {
          sap.ui.require([
            "sap/ui/export/Spreadsheet",
            "sap/ui/export/library"
          ], function (S, expLib) {
            Spreadsheet = S;
            EdmType = expLib.EdmType;
            res();
          }, function (err) { rej(err); });
        });

        var aRawFields = (opts.vmModel.getProperty("/mmctFieldsByCat/" + opts.cat) || []);
        var aCols = [];
        var aSortable = (aRawFields || [])
          .filter(function (f) {
            var n = parseInt(String(f.SortExcel != null ? f.SortExcel : 0), 10);
            return !isNaN(n) && n > 0;
          })
          .sort(function (a, b) {
            var nA = parseInt(String(a.SortExcel || 0), 10) || 0;
            var nB = parseInt(String(b.SortExcel || 0), 10) || 0;
            return nA - nB;
          });

        if (aSortable.length) {
          aCols = aSortable.map(function (f) {
            var sProp = String(f.UiFieldname || f.UIFIELDNAME || "").trim();
            var sLabel = String(f.UiFieldLabel || f.Descrizione || sProp).trim();
            return { label: sLabel, property: sProp };
          }).filter(function (c) { return !!c.property; });

          var mSeenCols = Object.create(null);
          aCols = aCols.filter(function (c) {
            var sKey = String(c.property || "").trim().toUpperCase();
            if (!sKey || mSeenCols[sKey]) return false;
            mSeenCols[sKey] = true;
            return true;
          });
        } else {
          aCols = [
            { label: "Categoria Materiale", property: "CatMateriale" },
            { label: "Desc. Categoria", property: "MatCatDesc" },
            { label: "Fornitore", property: "Fornitore" },
            { label: "Materiale", property: "Materiale" },
            { label: "Descrizione Materiale", property: "DescMat" },
            { label: "Stagione", property: "Stagione" },
            { label: "Collezione", property: "Collezione" },
            { label: "Linea", property: "Linea" },
            { label: "Uscita", property: "Uscita" },
            { label: "Fibra", property: "Fibra" },
            { label: "Qtà Fibra", property: "QtaFibra" },
            { label: "Unità Misura Fibra", property: "UmFibra" },
            { label: "UdM", property: "UdM" },
            { label: "Plant", property: "Plant" },
            { label: "Dest. Uso", property: "DestUso" },
            { label: "Famiglia", property: "Famiglia" }
          ];
        }

        var aData = opts.results.map(function (r) {
          var o = {};
          aCols.forEach(function (c) {
            o[c.property] = String(r[c.property] != null ? r[c.property] : "");
          });
          return o;
        });

        var oSheet = new Spreadsheet({
          workbook: {
            columns: aCols.map(function (c) {
              return { label: c.label, property: c.property, type: EdmType.String };
            })
          },
          dataSource: aData,
          fileName: "ListaMateriali_" + opts.cat + ".xlsx"
        });

        await oSheet.build();
        oSheet.destroy();
        MessageToast.show(I18n.text(null, "msg.materialListExported", [aData.length], "Lista materiali esportata ({0} righe)"));
      } catch (e) {
        console.error("[S6] Export material list error", e);
        MessageBox.error(I18n.text(null, "msg.materialListExportError", [], "Errore nell'esportazione della lista materiali"));
      } finally {
        BusyIndicator.hide();
      }
    },

    onFileSelected: function (opts) {
      var aFiles = opts.event.getParameter("files") || [];
      if (!aFiles.length) return;

      var sCat = opts.getSelectedCatFn();
      if (!sCat) {
        MessageToast.show(I18n.text(null, "msg.selectCategoryBeforeUpload", [], "Seleziona una categoria materiale prima di caricare il file"));
        opts.clearFileUploaderFn();
        return;
      }

      var oFile = aFiles[0];
      opts.ensureXlsxLoadedFn().then(function () {
        opts.parseExcelFileFn(oFile, sCat);
      }).catch(function (err) {
        console.error("[S6] XLSX load error", err);
        MessageBox.error(I18n.text(null, "msg.xlsxLibraryLoadError", [], "Errore nel caricamento della libreria XLSX. Assicurarsi che xlsx.full.min.js sia disponibile."));
      });
    },

    parseExcelFile: function (opts) {
      BusyIndicator.show(0);

      var oReader = new FileReader();
      oReader.onload = function (e) {
        try {
          var data = new Uint8Array(e.target.result);
          var workbook = XLSX.read(data, { type: "array" });

          var sFirstSheet = workbook.SheetNames[0];
          if (!sFirstSheet) {
            BusyIndicator.hide();
            MessageBox.error(I18n.text(null, "msg.excelHasNoSheets", [], "Il file Excel non contiene fogli"));
            return;
          }

          var aJsonRows = XLSX.utils.sheet_to_json(workbook.Sheets[sFirstSheet], { defval: "" });
          if (!aJsonRows.length) {
            BusyIndicator.hide();
            MessageToast.show(I18n.text(null, "msg.noRowsFoundInFile", [], "Nessuna riga trovata nel file"));
            return;
          }

          opts.logFn("Parsed Excel", { rows: aJsonRows.length, headers: Object.keys(aJsonRows[0]) });
          var aMapped = opts.mapExcelToMmctFieldsFn(aJsonRows, opts.cat);
          S6Excel.decorateUploadedRows(aMapped, opts.genGuidFn);
          opts.executeCheckFn(aMapped, opts.cat);
        } catch (ex) {
          BusyIndicator.hide();
          console.error("[S6] Excel parse error", ex);
          MessageBox.error(I18n.text(null, "msg.excelReadErrorWithMessage", [ex.message], "Errore nella lettura del file Excel:\n{0}"));
        }
      };

      oReader.onerror = function () {
        BusyIndicator.hide();
        MessageBox.error(I18n.text(null, "msg.fileReadError", [], "Errore nella lettura del file"));
      };

      oReader.readAsArrayBuffer(opts.file);
    },

    mapExcelToMmctFields: function (opts) {
      var aRawFields = (opts.vmModel.getProperty("/mmctFieldsByCat/" + opts.cat)) || [];
      return S6Excel.mapExcelToMmctFields(opts.jsonRows, opts.cat, aRawFields);
    },

    buildPayloadLines: function (opts) {
      return S6Excel.buildPayloadLines(opts.rows, opts.cat, {
        sUserId: (opts.vmModel && opts.vmModel.getProperty("/userId")) || "",
        mMulti: PostUtil.getMultiFieldsMap(opts.detailModel),
        aRawFields: (opts.vmModel.getProperty("/mmctFieldsByCat/" + opts.cat)) || [],
        getDomainValues: function (sDom) {
          return opts.vmModel.getProperty("/domainsByName/" + sDom) || [];
        }
      });
    },

    executeCheck: function (opts) {
      var aLines = this.buildPayloadLines({
        rows: opts.rows,
        cat: opts.cat,
        vmModel: opts.vmModel,
        detailModel: opts.detailModel
      });

      var oPayload = {
        UserID: (opts.vmModel && opts.vmModel.getProperty("/userId")) || "",
        PostDataCollection: aLines
      };

      opts.odataModel.setHeaders({ "sap-language": "IT" });
      opts.odataModel.create("/CheckDataSet", oPayload, {
        urlParameters: { "sap-language": "IT" },
        success: function (oData) {
          BusyIndicator.hide();
          S6Excel.applyCheckResponse(opts.rows, oData);

          opts.detailModel.setProperty("/checkErrorCount", (opts.rows || []).filter(function (r) { return !!r.__checkHasError; }).length);
          opts.detailModel.setProperty("/checkPassed", !((opts.rows || []).some(function (r) { return !!r.__checkHasError; })));
          opts.detailModel.setProperty("/checkDone", true);

          opts.populatePreviewTableFn(opts.rows, opts.cat);
          scheduleRowStyleRefresh(opts.updateCheckErrorRowStylesFn);

          var iErrors = opts.detailModel.getProperty("/checkErrorCount") || 0;
          var iTotal = opts.rows.length;

          if (iErrors === 0) {
            MessageToast.show(I18n.text(null, "msg.checkAllOk", [iTotal], "{0} righe verificate: tutte OK"));
            return;
          }

          var aErrDetails = [];
          opts.rows.forEach(function (r, idx) {
            if (r.__checkHasError) {
              aErrDetails.push(I18n.text(null, "msg.rowErrorDetail", [idx + 1, (r.__checkMessage || I18n.text(null, "msg.errorGenericShort", [], "Errore"))], "Riga {0}: {1}"));
            }
          });
          var sMsg = I18n.text(null, "msg.checkCompletedWithErrorsHeader", [iErrors, iTotal], "Verifica completata: {0} righe con errori su {1} totali.\n\n");
          sMsg += aErrDetails.slice(0, 15).join("\n");
          if (aErrDetails.length > 15) {
            sMsg += I18n.text(null, "msg.moreErrorRows", [aErrDetails.length - 15], "\n\n... e altre {0} righe con errori.");
          }
          sMsg += I18n.text(null, "msg.checkCompletedWithErrorsFooter", [], "\n\nCorreggere gli errori e ricaricare il file, oppure procedere con le sole righe valide.");
          MessageBox.warning(sMsg);
        },
        error: function (oError) {
          BusyIndicator.hide();
          console.error("[S6] CHECK error", oError);
          MessageBox.error(N.getBackendErrorMessage(oError));
          console.log("[S6] CHECK failed with HTTP error, populating preview anyway. Rows:", opts.rows.length);
          opts.rows.forEach(function (r) {
            r.__checkEsito = "Attenzione";
            r.__checkMessage = "Verifica non riuscita";
            r.__checkHasError = false;
          });
          opts.populatePreviewTableFn(opts.rows, opts.cat);
          scheduleRowStyleRefresh(opts.updateCheckErrorRowStylesFn);
        }
      });
    },

    onClearUpload: function (opts) {
      opts.detailModel.setProperty("/RowsAll", []);
      opts.detailModel.setProperty("/Rows", []);
      opts.detailModel.setProperty("/RowsCount", 0);
      opts.detailModel.setProperty("/checkDone", false);
      opts.detailModel.setProperty("/checkPassed", false);
      opts.detailModel.setProperty("/checkErrorCount", 0);
      opts.setErrorScrollHookedFn(false);
      opts.clearFileUploaderFn();
      MessageToast.show(I18n.text(null, "msg.uploadedDataCleared", [], "Dati caricati rimossi"));
    },

    onExportExcel: async function (opts) {
      try {
        BusyIndicator.show(0);
        var aRows = opts.detailModel.getProperty("/Rows") || [];
        if (!aRows.length) {
          MessageToast.show(I18n.text(null, "msg.noDataToExport", [], "Nessun dato da esportare"));
          return;
        }

        var Spreadsheet;
        var EdmType;
        await new Promise(function (res, rej) {
          sap.ui.require([
            "sap/ui/export/Spreadsheet",
            "sap/ui/export/library"
          ], function (S, expLib) {
            Spreadsheet = S;
            EdmType = expLib.EdmType;
            res();
          }, function (err) { rej(err); });
        });

        var aKeys = Object.keys(aRows[0] || {}).filter(function (k) { return k.charAt(0) !== "_"; });
        var aCols = aKeys.map(function (k) { return { label: k, property: k, type: EdmType.String }; });
        var aData = aRows.map(function (r) {
          var o = {};
          aKeys.forEach(function (k) { o[k] = String(r[k] != null ? r[k] : ""); });
          return o;
        });

        var oSheet = new Spreadsheet({
          workbook: { columns: aCols },
          dataSource: aData,
          fileName: "Preview_Upload.xlsx"
        });
        await oSheet.build();
        oSheet.destroy();
        MessageToast.show(I18n.text(null, "msg.excelExported", [], "Excel esportato"));
      } catch (e) {
        console.error("[S6] Export error", e);
        MessageToast.show(I18n.text(null, "msg.exportError", [], "Errore export"));
      } finally {
        BusyIndicator.hide();
      }
    },

    onSendData: function (opts) {
      var aRows = opts.detailModel.getProperty("/RowsAll") || [];
      if (!aRows.length) {
        MessageToast.show(I18n.text(null, "msg.noDataToSend", [], "Nessun dato da inviare"));
        return;
      }

      var sCat = opts.getSelectedCatFn();
      if (!sCat) {
        MessageToast.show(I18n.text(null, "msg.selectMaterialCategoryLowercase", [], "Seleziona una categoria materiale"));
        return;
      }

      if (!this.validateRequiredFieldsForRows({
        rows: aRows,
        cat: sCat,
        vmModel: opts.vmModel
      })) return;

      var aRowsToSend = this.filterOutCheckErrorRows({
        rows: aRows,
        detailModel: opts.detailModel
      });
      if (!aRowsToSend) return;

      var iCheckErrors = opts.detailModel.getProperty("/checkErrorCount") || 0;
      var sConfirmMsg = I18n.text(null, "msg.confirmSendRowsHeader", [aRowsToSend.length], "Stai per inviare {0} righe al sistema.");
      if (iCheckErrors > 0) {
        sConfirmMsg += I18n.text(null, "msg.confirmSendRowsExcludedErrors", [iCheckErrors], "\n({0} righe con errori saranno escluse)");
      }
      sConfirmMsg += I18n.text(null, "msg.confirmContinue", [], "\nProseguire?");

      var self = this;
      MessageBox.confirm(sConfirmMsg, {
        actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
        emphasizedAction: MessageBox.Action.OK,
        onClose: function (sAction) {
          if (sAction === MessageBox.Action.OK) {
            self.executePost({
              rows: aRowsToSend,
              cat: sCat,
              odataModel: opts.odataModel,
              vmModel: opts.vmModel,
              detailModel: opts.detailModel,
              clearUploadFn: opts.clearUploadFn
            });
          }
        }
      });
    },

    validateRequiredFieldsForRows: function (opts) {
      var aRawFields = (opts.vmModel.getProperty("/mmctFieldsByCat/" + opts.cat)) || [];
      var oValidation = S6Excel.validateRequiredRows(opts.rows, aRawFields);
      var aErrors = oValidation.errors;
      if (!aErrors.length) return true;

      var sMsg = I18n.text(null, "msg.requiredFieldsMissingHeader", [], "Campi obbligatori mancanti:\n\n");
      sMsg += aErrors.slice(0, 10).join("\n");
      if (aErrors.length > 10) {
        sMsg += I18n.text(null, "msg.moreErrorRows", [aErrors.length - 10], "\n\n... e altre {0} righe con errori.");
      }
      sMsg += I18n.text(null, "msg.requiredFieldsMissingTotal", [aErrors.length, opts.rows.length], "\n\nTotale righe con errori: {0} su {1}");
      MessageBox.warning(sMsg);
      return false;
    },

    filterOutCheckErrorRows: function (opts) {
      var iCheckErrors = opts.detailModel.getProperty("/checkErrorCount") || 0;
      if (iCheckErrors <= 0) return opts.rows;

      var aFiltered = S6Excel.filterRowsWithoutCheckErrors(opts.rows);
      if (!aFiltered.length) {
        MessageBox.error(I18n.text(null, "msg.allRowsHaveCheckErrors", [], "Tutte le righe hanno errori di verifica. Correggere e ricaricare il file."));
        return null;
      }
      return aFiltered;
    },

    executePost: function (opts) {
      var aLines = this.buildPayloadLines({
        rows: opts.rows,
        cat: opts.cat,
        vmModel: opts.vmModel,
        detailModel: opts.detailModel
      });

      var oPayload = {
        UserID: (opts.vmModel && opts.vmModel.getProperty("/userId")) || "",
        PostDataCollection: aLines
      };

      BusyIndicator.show(0);
      opts.odataModel.setHeaders({ "sap-language": "IT" });
      opts.odataModel.create("/PostDataSet", oPayload, {
        urlParameters: { "sap-language": "IT" },
        success: function () {
          BusyIndicator.hide();
          MessageBox.success(I18n.text(null, "msg.dataSentSuccessfully", [aLines.length], "Dati inviati con successo ({0} righe)"));
          opts.clearUploadFn();
        },
        error: function (oError) {
          BusyIndicator.hide();
          console.error("[S6] POST error", oError);
          MessageBox.error(N.getBackendErrorMessage(oError));
        }
      });
    }
  };
});
