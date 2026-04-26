sap.ui.define([
  "apptracciabilita/apptracciabilita/controller/BaseController",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "sap/ui/core/BusyIndicator",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/mdc/table/Column",
  "sap/m/HBox",
  "sap/m/Text",
  "sap/ui/mdc/p13n/StateUtil",

  // ===== UTIL =====
  "apptracciabilita/apptracciabilita/util/normalize",
  "apptracciabilita/apptracciabilita/util/domains",
  "apptracciabilita/apptracciabilita/util/mdcTableUtil",
  "apptracciabilita/apptracciabilita/util/p13nUtil",
  "apptracciabilita/apptracciabilita/util/filterSortUtil",
  "apptracciabilita/apptracciabilita/util/mmctUtil",
  "apptracciabilita/apptracciabilita/util/TableColumnAutoSize",
  "apptracciabilita/apptracciabilita/util/postUtil",
  "apptracciabilita/apptracciabilita/util/recordsUtil",
  "apptracciabilita/apptracciabilita/util/s6ExcelUtil",
  "apptracciabilita/apptracciabilita/util/i18nUtil"

], function (
  BaseController, JSONModel, MessageToast, MessageBox, BusyIndicator,
  Filter, FilterOperator, MdcColumn, HBox, Text, StateUtil,
  N, Domains, MdcTableUtil, P13nUtil,
  FilterSortUtil, MmctUtil, TableColumnAutoSize,
  PostUtil, RecordsUtil, S6Excel, I18n
) {
  "use strict";

  return BaseController.extend("apptracciabilita.apptracciabilita.controller.Screen6", {

    _sLogPrefix: "[S6]",
    MAIN_TABLE_ID: "mdcTable6",
    MAIN_INPUT_FILTER_ID: "inputFilter6",

    // ==================== INIT ====================
    onInit: function () {
      var oVm = this._getOVm();
      oVm.setProperty("/mdcCfg/screen6", { modelName: "detail", collectionPath: "/Rows", properties: [] });

      this._log("onInit");
      this.getOwnerComponent().getRouter().getRoute("Screen6").attachPatternMatched(this._onRouteMatched, this);

      this.getView().setModel(new JSONModel({ showHeaderFilters: false, showHeaderSort: true }), "ui");
      this.getView().setModel(new JSONModel({
        selectedCat: "",
        RowsAll: [], Rows: [], RowsCount: 0,
        _mmct: { cat: "", s01: [], s02: [] },
        __q: "",
        checkDone: false,
        checkPassed: false,
        checkErrorCount: 0
      }), "detail");

      this._inlineFS = { filters: {}, sort: { key: "", desc: false }, sortBtns: {}, filterInputs: {}, headerTitles: {}, headerRows: {}, headerBoxes: {} };
      this._xlsxLoaded = false;
    },

    // ==================== ROUTE ====================
    _onRouteMatched: function () {
      var self = this;
      this._ensureUserInfosLoaded().then(function () {
        self._log("_onRouteMatched");
        self._buildCategoriesList();
      });
    },

    _buildCategoriesList: function () {
      var oVm = this.getOwnerComponent().getModel("vm");
      var aMMCT = oVm.getProperty("/userCategories") || oVm.getProperty("/userMMCT") || oVm.getProperty("/UserInfosMMCT") || [];
      var aCatList = S6Excel.buildCategoryList(oVm.getProperty("/mmctFieldsByCat") || {}, aMMCT);
      oVm.setProperty("/userCategoriesList", aCatList);
    },

    _getSelectedCat: function () {
      var oCombo = this.byId("comboCatMat6");
      return (oCombo && oCombo.getSelectedKey()) || "";
    },

    // ==================== DOWNLOAD TEMPLATE ====================
    onDownloadTemplate: function () {
      var sCat = this._getSelectedCat();
      if (!sCat) {
        MessageToast.show(I18n.text(this, "msg.selectMaterialCategoryLowercase", [], "Seleziona una categoria materiale"));
        return;
      }

      var oODataModel = this.getOwnerComponent().getModel();
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
            MessageBox.warning(I18n.text(this, "msg.noTemplateForCategory", [sCat], "Nessun template disponibile per la categoria \"{0}\""));
            return;
          }

          // B64 → Blob → download
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
            MessageToast.show(I18n.text(this, "msg.templateDownloaded", [sFileName], "Template scaricato: {0}"));
          } catch (e) {
            console.error("[S6] Download template error", e);
            MessageBox.error(I18n.text(this, "msg.templateDownloadError", [], "Errore nel download del template"));
          }
        },
        error: function (oError) {
          BusyIndicator.hide();
          console.error("[S6] GetFieldFileSet error", oError);
          MessageBox.error(N.getBackendErrorMessage(oError));
        }
      });
    },

    // ==================== DOWNLOAD MATERIAL LIST ====================
    onDownloadMaterialList: function () {
      var sCat = this._getSelectedCat();
      if (!sCat) {
        MessageToast.show(I18n.text(this, "msg.selectMaterialCategoryLowercase", [], "Seleziona una categoria materiale"));
        return;
      }

      var oODataModel = this.getOwnerComponent().getModel();
      var self = this;
      BusyIndicator.show(0);

      oODataModel.read("/ExcelMaterialListSet", {
        filters: [new Filter("CatMateriale", FilterOperator.EQ, sCat)],
        urlParameters: { "$top": "99999" },
        success: function (oData) {
          var aResults = (oData && oData.results) || [];
          if (!aResults.length) {
            BusyIndicator.hide();
            MessageToast.show(I18n.text(this, "msg.noNewMaterialForCategory", [sCat], "Nessun materiale nuovo trovato per la categoria {0}"));
            return;
          }

          // Convert to Excel using sap/ui/export/Spreadsheet
          self._exportMaterialListToExcel(aResults, sCat);
        },
        error: function (oError) {
          BusyIndicator.hide();
          console.error("[S6] ExcelMaterialListSet error", oError);
          MessageBox.error(I18n.text(this, "msg.materialListLoadError", [], "Errore nel caricamento della lista materiali"));
        }
      }.bind(this));
    },

    _exportMaterialListToExcel: async function (aResults, sCat) {
      try {
        var Spreadsheet, EdmType;
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

        // Build columns dynamically from MMCT config using the SortExcel field:
        //   - SortExcel = 0  → column excluded from export
        //   - SortExcel > 0  → column included, sorted by ascending value
        // Fallback to a hardcoded list if no field has SortExcel configured
        // (e.g. during MMCT migration or for categories not yet configured).
        var oVm = this.getOwnerComponent().getModel("vm");
        var aRawFields = (oVm.getProperty("/mmctFieldsByCat/" + sCat)) || [];

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
            return true; /*  */
          });
        } else {
          // Fallback: hardcoded legacy list
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

        // Clean data: remove __metadata
        var aData = aResults.map(function (r) {
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
          fileName: "ListaMateriali_" + sCat + ".xlsx"
        });

        await oSheet.build();
        oSheet.destroy();
        MessageToast.show(I18n.text(this, "msg.materialListExported", [aData.length], "Lista materiali esportata ({0} righe)"));
      } catch (e) {
        console.error("[S6] Export material list error", e);
        MessageBox.error(I18n.text(this, "msg.materialListExportError", [], "Errore nell'esportazione della lista materiali"));
      } finally {
        BusyIndicator.hide();
      }
    },
    // ==================== UPLOAD FILE ====================
    onFileSelected: function (oEvt) {
      var aFiles = oEvt.getParameter("files") || [];
      if (!aFiles.length) return;

      var sCat = this._getSelectedCat();
      if (!sCat) {
        MessageToast.show(I18n.text(this, "msg.selectCategoryBeforeUpload", [], "Seleziona una categoria materiale prima di caricare il file"));
        this.byId("fileUploader6").clear();
        return;
      }

      var self = this;
      var oFile = aFiles[0];

      this._ensureXlsxLoaded().then(function () {
        self._parseExcelFile(oFile, sCat);
      }).catch(function (err) {
        console.error("[S6] XLSX load error", err);
        MessageBox.error(I18n.text(this, "msg.xlsxLibraryLoadError", [], "Errore nel caricamento della libreria XLSX. Assicurarsi che xlsx.full.min.js sia disponibile."));
      }.bind(this));
    },

    _ensureXlsxLoaded: function () {
      if (window.XLSX) return Promise.resolve();
      if (this._xlsxPromise) return this._xlsxPromise;

      var self = this;
      this._xlsxPromise = new Promise(function (resolve, reject) {
        // Try loading from local project first, then CDN
        var aPaths = [
          jQuery.sap.getModulePath("apptracciabilita/apptracciabilita") + "/lib/xlsx.full.min.js",
          "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"
        ];

        function tryLoad(idx) {
          if (idx >= aPaths.length) {
            reject(new Error("XLSX library not found"));
            return;
          }
          var oScript = document.createElement("script");
          oScript.src = aPaths[idx];
          oScript.onload = function () {
            if (window.XLSX) {
              self._xlsxLoaded = true;
              resolve();
            } else {
              tryLoad(idx + 1);
            }
          };
          oScript.onerror = function () { tryLoad(idx + 1); };
          document.head.appendChild(oScript);
        }

        tryLoad(0);
      });

      return this._xlsxPromise;
    },

    _parseExcelFile: function (oFile, sCat) {
      var self = this;
      BusyIndicator.show(0);

      var oReader = new FileReader();
      oReader.onload = function (e) {
        try {
          var data = new Uint8Array(e.target.result);
          var workbook = XLSX.read(data, { type: "array" });

          // Read first sheet
          var sFirstSheet = workbook.SheetNames[0];
          if (!sFirstSheet) {
            BusyIndicator.hide();
            MessageBox.error(I18n.text(this, "msg.excelHasNoSheets", [], "Il file Excel non contiene fogli"));
            return;
          }

          var aJsonRows = XLSX.utils.sheet_to_json(workbook.Sheets[sFirstSheet], { defval: "" });
          if (!aJsonRows.length) {
            BusyIndicator.hide();
            MessageToast.show(I18n.text(this, "msg.noRowsFoundInFile", [], "Nessuna riga trovata nel file"));
            return;
          }

          self._log("Parsed Excel", { rows: aJsonRows.length, headers: Object.keys(aJsonRows[0]) });

          // Map Excel headers to MMCT field names
          var aMapped = self._mapExcelToMmctFields(aJsonRows, sCat);

          // Mark all rows as new + editable
          S6Excel.decorateUploadedRows(aMapped, N.genGuidNew);

          // ── Auto-check via CheckDataSet, then populate ──
          self._executeCheck(aMapped, sCat);

        } catch (ex) {
          BusyIndicator.hide();
          console.error("[S6] Excel parse error", ex);
          MessageBox.error(I18n.text(this, "msg.excelReadErrorWithMessage", [ex.message], "Errore nella lettura del file Excel:\n{0}"));
        }
      }.bind(this);

      oReader.onerror = function () {
        BusyIndicator.hide();
        MessageBox.error(I18n.text(this, "msg.fileReadError", [], "Errore nella lettura del file"));
      }.bind(this);

      oReader.readAsArrayBuffer(oFile);
    },

    // ==================== MAP EXCEL HEADERS → MMCT FIELDS ====================
    _mapExcelToMmctFields: function (aJsonRows, sCat) {
      var oVm = this.getOwnerComponent().getModel("vm");
      var aRawFields = (oVm.getProperty("/mmctFieldsByCat/" + sCat)) || [];
      return S6Excel.mapExcelToMmctFields(aJsonRows, sCat, aRawFields);
    },

    // ==================== CHECK DATA (auto after upload) ====================
    _buildPayloadLines: function (aRows, sCat) {
      var oVm = this.getOwnerComponent().getModel("vm");
      var oDetail = this.getView().getModel("detail");
      return S6Excel.buildPayloadLines(aRows, sCat, {
        sUserId: (oVm && oVm.getProperty("/userId")) || "",
        mMulti: PostUtil.getMultiFieldsMap(oDetail),
        aRawFields: (oVm.getProperty("/mmctFieldsByCat/" + sCat)) || [],
        getDomainValues: function (sDom) {
          return oVm.getProperty("/domainsByName/" + sDom) || [];
        }
      });
    },

    _executeCheck: function (aRows, sCat) {
      var oODataModel = this.getOwnerComponent().getModel();
      var oVm = this.getOwnerComponent().getModel("vm");
      var sUserId = (oVm && oVm.getProperty("/userId")) || "";
      var self = this;

      var aLines = this._buildPayloadLines(aRows, sCat);

      var oPayload = {
        UserID: sUserId,
        PostDataCollection: aLines
      };

      oODataModel.setHeaders({ "sap-language": "IT" });
      oODataModel.create("/CheckDataSet", oPayload, {
        urlParameters: { "sap-language": "IT" },
        success: function (oData) {
          BusyIndicator.hide();
          self._processCheckResponse(aRows, oData);
          self._populatePreviewTable(aRows, sCat);

          // Highlight error rows after table renders
          setTimeout(function () { self._updateCheckErrorRowStyles(); }, 1500); setTimeout(function () { self._updateCheckErrorRowStyles(); }, 3000);

          var oDetail = self.getView().getModel("detail");
          var iErrors = oDetail.getProperty("/checkErrorCount") || 0;
          var iTotal = aRows.length;

          if (iErrors === 0) {
            MessageToast.show(I18n.text(this, "msg.checkAllOk", [iTotal], "{0} righe verificate: tutte OK"));
          } else {
            // Build per-row error detail like Screen3/4
            var aErrDetails = [];
            aRows.forEach(function (r, idx) {
              if (r.__checkHasError) {
                aErrDetails.push(I18n.text(this, "msg.rowErrorDetail", [idx + 1, (r.__checkMessage || I18n.text(this, "msg.errorGenericShort", [], "Errore"))], "Riga {0}: {1}"));
              }
            }.bind(this));
            var sMsg = I18n.text(this, "msg.checkCompletedWithErrorsHeader", [iErrors, iTotal], "Verifica completata: {0} righe con errori su {1} totali.\n\n");
            sMsg += aErrDetails.slice(0, 15).join("\n");
            if (aErrDetails.length > 15) {
              sMsg += I18n.text(this, "msg.moreErrorRows", [aErrDetails.length - 15], "\n\n... e altre {0} righe con errori.");
            }
            sMsg += I18n.text(this, "msg.checkCompletedWithErrorsFooter", [], "\n\nCorreggere gli errori e ricaricare il file, oppure procedere con le sole righe valide.");
            MessageBox.warning(sMsg);
          }
        }.bind(this),
        error: function (oError) {
          BusyIndicator.hide();
          console.error("[S6] CHECK error", oError);
          MessageBox.error(N.getBackendErrorMessage(oError));

          // Still populate preview even if check fails
          console.log("[S6] CHECK failed with HTTP error, populating preview anyway. Rows:", aRows.length);
          aRows.forEach(function (r) {
            r.__checkEsito = "Attenzione";
            r.__checkMessage = "Verifica non riuscita";
            r.__checkHasError = false;
          });
          self._populatePreviewTable(aRows, sCat);
          setTimeout(function () { self._updateCheckErrorRowStyles(); }, 1500); setTimeout(function () { self._updateCheckErrorRowStyles(); }, 3000);
        }
      });
    },

    _processCheckResponse: function (aRows, oData) {
      var oDetail = this.getView().getModel("detail");
      var oCheckState = S6Excel.applyCheckResponse(aRows, oData);

      oDetail.setProperty("/checkErrorCount", oCheckState.errorCount);
      oDetail.setProperty("/checkPassed", oCheckState.checkPassed);
      oDetail.setProperty("/checkDone", oCheckState.checkDone);
    },

    // ==================== CHECK ERROR ROW HIGHLIGHTING ====================
    _updateCheckErrorRowStyles: function () {
      var oMdcTbl = this.byId("mdcTable6");
      if (!oMdcTbl) { console.log("[S6] ROW-STYLE: mdcTable6 not found"); return; }

      var oInner = MdcTableUtil.getInnerTableFromMdc(oMdcTbl);
      if (!oInner) { console.log("[S6] ROW-STYLE: inner table not found"); return; }

      // GridTable (sap.ui.table.Table)
      if (oInner.isA && oInner.isA("sap.ui.table.Table")) {
        var aRows = (oInner.getRows && oInner.getRows()) || [];
        var iMarked = 0;
        aRows.forEach(function (oRowCtrl) {
          if (!oRowCtrl) return;
          var oCtx = oRowCtrl.getBindingContext("detail") || oRowCtrl.getBindingContext();
          var oObj = oCtx && oCtx.getObject && oCtx.getObject();
          if (oObj && oObj.__checkHasError) {
            oRowCtrl.addStyleClass("s3PostErrorRow");
            iMarked++;
          } else {
            oRowCtrl.removeStyleClass("s3PostErrorRow");
          }
        });
        // Re-apply on scroll
        var self = this;
        if (!this._s6ErrorScrollHooked) {
          this._s6ErrorScrollHooked = true;
          oInner.attachFirstVisibleRowChanged(function () {
            setTimeout(function () { self._updateCheckErrorRowStyles(); }, 100);
          });
        }
        return;
      }

      // ResponsiveTable (sap.m.Table)
      if (oInner.isA && (oInner.isA("sap.m.Table") || oInner.isA("sap.m.ListBase"))) {
        var aItems = (oInner.getItems && oInner.getItems()) || [];
        var iMarked2 = 0;
        aItems.forEach(function (it) {
          if (!it) return;
          var oCtx2 = it.getBindingContext("detail") || it.getBindingContext();
          var oObj2 = oCtx2 && oCtx2.getObject && oCtx2.getObject();
          if (oObj2 && oObj2.__checkHasError) {
            it.addStyleClass("s3PostErrorRow");
            iMarked2++;
          } else {
            it.removeStyleClass("s3PostErrorRow");
          }
        });
      }
    },

    // ==================== POPULATE PREVIEW TABLE ====================
    _populatePreviewTable: async function (aRows, sCat) {
      var oDetail = this.getView().getModel("detail");
      var oVm = this.getOwnerComponent().getModel("vm");

      // Set category and hydrate MMCT
      oDetail.setProperty("/_mmct/cat", sCat);
      var aRawFields = (oVm.getProperty("/mmctFieldsByCat/" + sCat)) || [];
      var oPreviewCfg = S6Excel.buildPreviewConfig(aRawFields);
      var aCfgAll = oPreviewCfg.cfgAll;

      // Set rows
      oDetail.setProperty("/RowsAll", aRows);
      oDetail.setProperty("/Rows", aRows);
      oDetail.setProperty("/RowsCount", aRows.length);

      // Set MDC config
      oVm.setProperty("/mdcCfg/screen6", { modelName: "detail", collectionPath: "/Rows", properties: oPreviewCfg.props });

      // Rebuild table columns
      var oTbl = this.byId("mdcTable6");
      if (!oTbl) return;

      this._inlineFS = MdcTableUtil.ensureInlineFS(this._inlineFS);
      MdcTableUtil.resetInlineHeaderControls(this._inlineFS);
      await this._rebuildColumnsHard(oTbl, aCfgAll);
      TableColumnAutoSize.autoSize(oTbl, 60);

      if (oTbl.initialized) await oTbl.initialized();
      oTbl.setModel(oDetail, "detail");

      await this._applyInlineHeaderFilterSort(oTbl);
      this._applyClientFilters();
      if (typeof oTbl.rebind === "function") oTbl.rebind();

      await P13nUtil.forceP13nAllVisible(oTbl, StateUtil, this._log.bind(this), "t0");
      await this._applyInlineHeaderFilterSort(oTbl);

      this._scheduleHeaderFilterSort(oTbl);
    },

    // ==================== TABLE COLUMNS ====================
    _rebuildColumnsHard: async function (oTbl, aCfgAll) {
      if (!oTbl) return;
      if (oTbl.initialized) await oTbl.initialized();

      var aOld = (oTbl.getColumns && oTbl.getColumns()) || [];
      aOld.slice().forEach(function (c) { oTbl.removeColumn(c); c.destroy(); });

      var seen = Object.create(null);
      var aCfgUnique = (aCfgAll || []).filter(function (f) {
        var ui = String(f && f.ui || "").trim();
        if (!ui) return false;
        if (ui.toUpperCase() === "STATO") return false;
        var k = ui.toUpperCase();
        if (seen[k]) return false;
        seen[k] = true;
        return true;
      });

      var mP = MdcColumn.getMetadata().getAllProperties();

      aCfgUnique.forEach(function (f) {
        var sKey = String(f.ui || "").trim();
        if (!sKey) return;
        var sHeader = (f.label || sKey) + (f.required ? " *" : "");
        var oColProps = {
          header: sHeader, visible: true, dataProperty: sKey,
          template: this._createCellTemplate(sKey, f)
        };
        if (mP.propertyKey) oColProps.propertyKey = sKey;
        oTbl.addColumn(new MdcColumn(oColProps));
      }.bind(this));
    },

    _createCellTemplate: function (sKey) {
      // Screen6: read-only preview — always use Text
      return new Text({ text: "{detail>" + sKey + "}", wrapping: false });
    },

    // ==================== FILTERS ====================
    _applyClientFilters: function () {
      FilterSortUtil.applyClientFilters(this.getView().getModel("detail"), this._inlineFS, this.byId("mdcTable6"));
    },
    onGlobalFilter: function (oEvt) { FilterSortUtil.onGlobalFilter(oEvt, this.getView().getModel("detail"), this._applyClientFilters.bind(this)); },

    // ==================== CLEAR UPLOAD ====================
    onClearUpload: function () {
      var oDetail = this.getView().getModel("detail");
      oDetail.setProperty("/RowsAll", []);
      oDetail.setProperty("/Rows", []);
      oDetail.setProperty("/RowsCount", 0);
      oDetail.setProperty("/checkDone", false);
      oDetail.setProperty("/checkPassed", false);
      oDetail.setProperty("/checkErrorCount", 0);
      this._s6ErrorScrollHooked = false;
      this.byId("fileUploader6").clear();
      MessageToast.show(I18n.text(this, "msg.uploadedDataCleared", [], "Dati caricati rimossi"));
    },

    // ==================== EXPORT PREVIEW ====================
    onExportExcel: async function () {
      try {
        BusyIndicator.show(0);
        var oDetail = this.getView().getModel("detail");
        var aRows = oDetail.getProperty("/Rows") || [];
        if (!aRows.length) { MessageToast.show(I18n.text(this, "msg.noDataToExport", [], "Nessun dato da esportare")); return; }

        var Spreadsheet, EdmType;
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

        var oSheet = new Spreadsheet({ workbook: { columns: aCols }, dataSource: aData, fileName: "Preview_Upload.xlsx" });
        await oSheet.build();
        oSheet.destroy();
        MessageToast.show(I18n.text(this, "msg.excelExported", [], "Excel esportato"));
      } catch (e) {
        console.error("[S6] Export error", e);
        MessageToast.show(I18n.text(this, "msg.exportError", [], "Errore export"));
      } finally {
        BusyIndicator.hide();
      }
    },

    // ==================== SEND DATA (POST) ====================
    onSendData: function () {
      var oDetail = this.getView().getModel("detail");
      var aRows = oDetail.getProperty("/RowsAll") || [];
      if (!aRows.length) {
        MessageToast.show(I18n.text(this, "msg.noDataToSend", [], "Nessun dato da inviare"));
        return;
      }

      var sCat = this._getSelectedCat();
      if (!sCat) {
        MessageToast.show(I18n.text(this, "msg.selectMaterialCategoryLowercase", [], "Seleziona una categoria materiale"));
        return;
      }

      if (!this._validateRequiredFieldsForRows(aRows, sCat)) return;

      var aRowsToSend = this._filterOutCheckErrorRows(aRows, oDetail);
      if (!aRowsToSend) return;

      var self = this;
      var iCheckErrors = oDetail.getProperty("/checkErrorCount") || 0;
      var sConfirmMsg = I18n.text(this, "msg.confirmSendRowsHeader", [aRowsToSend.length], "Stai per inviare {0} righe al sistema.");
      if (iCheckErrors > 0) {
        sConfirmMsg += I18n.text(this, "msg.confirmSendRowsExcludedErrors", [iCheckErrors], "\n({0} righe con errori saranno escluse)");
      }
      sConfirmMsg += I18n.text(this, "msg.confirmContinue", [], "\nProseguire?");

      MessageBox.confirm(sConfirmMsg, {
        actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
        emphasizedAction: MessageBox.Action.OK,
        onClose: function (sAction) {
          if (sAction === MessageBox.Action.OK) {
            self._executePost(aRowsToSend, sCat);
          }
        }
      });
    },

    _validateRequiredFieldsForRows: function (aRows, sCat) {
      var oVm = this.getOwnerComponent().getModel("vm");
      var aRawFields = (oVm.getProperty("/mmctFieldsByCat/" + sCat)) || [];
      var oValidation = S6Excel.validateRequiredRows(aRows, aRawFields);
      var aErrors = oValidation.errors;
      if (!aErrors.length) return true;

      var sMsg = I18n.text(this, "msg.requiredFieldsMissingHeader", [], "Campi obbligatori mancanti:\n\n");
      sMsg += aErrors.slice(0, 10).join("\n");
      if (aErrors.length > 10) {
        sMsg += I18n.text(this, "msg.moreErrorRows", [aErrors.length - 10], "\n\n... e altre {0} righe con errori.");
      }
      sMsg += I18n.text(this, "msg.requiredFieldsMissingTotal", [aErrors.length, aRows.length], "\n\nTotale righe con errori: {0} su {1}");
      MessageBox.warning(sMsg);
      return false;
    },

    _filterOutCheckErrorRows: function (aRows, oDetail) {
      var iCheckErrors = oDetail.getProperty("/checkErrorCount") || 0;
      if (iCheckErrors <= 0) return aRows;

      var aFiltered = S6Excel.filterRowsWithoutCheckErrors(aRows);
      if (!aFiltered.length) {
        MessageBox.error(I18n.text(this, "msg.allRowsHaveCheckErrors", [], "Tutte le righe hanno errori di verifica. Correggere e ricaricare il file."));
        return null;
      }
      return aFiltered;
    },

    _executePost: function (aRows, sCat) {
      var oODataModel = this.getOwnerComponent().getModel();
      var oVm = this.getOwnerComponent().getModel("vm");
      var sUserId = (oVm && oVm.getProperty("/userId")) || "";

      var aLines = this._buildPayloadLines(aRows, sCat);

      var oPayload = {
        UserID: sUserId,
        PostDataCollection: aLines
      };

      BusyIndicator.show(0);
      var self = this;

      oODataModel.setHeaders({ "sap-language": "IT" });
      oODataModel.create("/PostDataSet", oPayload, {
        urlParameters: { "sap-language": "IT" },
        success: function (oData) {
          BusyIndicator.hide();
          MessageBox.success(I18n.text(this, "msg.dataSentSuccessfully", [aLines.length], "Dati inviati con successo ({0} righe)"));
          self.onClearUpload();
        }.bind(this),
        error: function (oError) {
          BusyIndicator.hide();
          console.error("[S6] POST error", oError);
          MessageBox.error(N.getBackendErrorMessage(oError));
        }
      });
    },
    // ==================== NAV ====================
    _getNavBackFallback: function () {
      return { route: "Screen0", params: {} };
    }
  });
});
