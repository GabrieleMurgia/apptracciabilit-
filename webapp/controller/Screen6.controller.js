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
  "apptracciabilita/apptracciabilita/util/s6ExcelUtil"

], function (
  BaseController, JSONModel, MessageToast, MessageBox, BusyIndicator,
  Filter, FilterOperator, MdcColumn, HBox, Text, StateUtil,
  N, Domains, MdcTableUtil, P13nUtil,
  FilterSortUtil, MmctUtil, TableColumnAutoSize,
  PostUtil, RecordsUtil, S6Excel
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
      var mCats = oVm.getProperty("/mmctFieldsByCat") || {};
      var aCatKeys = Object.keys(mCats);

      if (!aCatKeys.length) {
        var aMMCT = oVm.getProperty("/userCategories") || oVm.getProperty("/userMMCT") || oVm.getProperty("/UserInfosMMCT") || [];
        var catSeen = {};
        (aMMCT || []).forEach(function (cat) {
          var c = String(cat && (cat.CatMateriale || cat.CATMATERIALE || cat.Categoria || "") || "").trim();
          if (c && !catSeen[c]) { catSeen[c] = true; aCatKeys.push(c); }
        });
      }

      var aCatList = aCatKeys.map(function (k) {
        var sDesc = "";
        try {
          var aMMCTSrc = oVm.getProperty("/userCategories") || oVm.getProperty("/userMMCT") || oVm.getProperty("/UserInfosMMCT") || [];
          (aMMCTSrc || []).some(function (cat) {
            var c = String(cat && (cat.CatMateriale || cat.CATMATERIALE || "") || "").trim();
            if (c === k) {
              sDesc = String(cat.CatMaterialeDesc || cat.DescCatMateriale || cat.MatCatDesc || cat.Description || "").trim();
              return true;
            }
            return false;
          });
        } catch (e) {}
        return { key: k, text: sDesc ? (k + " – " + sDesc) : k };
      });

      aCatList.sort(function (a, b) { return a.text.localeCompare(b.text); });
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
        MessageToast.show("Seleziona una categoria materiale");
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
            MessageBox.warning("Nessun template disponibile per la categoria \"" + sCat + "\"");
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
            MessageToast.show("Template scaricato: " + sFileName);
          } catch (e) {
            console.error("[S6] Download template error", e);
            MessageBox.error("Errore nel download del template");
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
        MessageToast.show("Seleziona una categoria materiale");
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
            MessageToast.show("Nessun materiale nuovo trovato per la categoria " + sCat);
            return;
          }

          // Convert to Excel using sap/ui/export/Spreadsheet
          self._exportMaterialListToExcel(aResults, sCat);
        },
        error: function (oError) {
          BusyIndicator.hide();
          console.error("[S6] ExcelMaterialListSet error", oError);
          MessageBox.error("Errore nel caricamento della lista materiali");
        }
      });
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
        MessageToast.show("Lista materiali esportata (" + aData.length + " righe)");
      } catch (e) {
        console.error("[S6] Export material list error", e);
        MessageBox.error("Errore nell'esportazione della lista materiali");
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
        MessageToast.show("Seleziona una categoria materiale prima di caricare il file");
        this.byId("fileUploader6").clear();
        return;
      }

      var self = this;
      var oFile = aFiles[0];

      this._ensureXlsxLoaded().then(function () {
        self._parseExcelFile(oFile, sCat);
      }).catch(function (err) {
        console.error("[S6] XLSX load error", err);
        MessageBox.error("Errore nel caricamento della libreria XLSX. Assicurarsi che xlsx.full.min.js sia disponibile.");
      });
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
            MessageBox.error("Il file Excel non contiene fogli");
            return;
          }

          var aJsonRows = XLSX.utils.sheet_to_json(workbook.Sheets[sFirstSheet], { defval: "" });
          if (!aJsonRows.length) {
            BusyIndicator.hide();
            MessageToast.show("Nessuna riga trovata nel file");
            return;
          }

          self._log("Parsed Excel", { rows: aJsonRows.length, headers: Object.keys(aJsonRows[0]) });

          // Map Excel headers to MMCT field names
          var aMapped = self._mapExcelToMmctFields(aJsonRows, sCat);

          // Mark all rows as new + editable
          aMapped.forEach(function (r, i) {
            r.__readOnly = false;
            r.__isNew = true;
            r.CodAgg = "I";
            r.Stato = "ST";
            r.idx = i;
            r.guidKey = N.genGuidNew ? N.genGuidNew() : ("EXCEL-" + Date.now() + "-" + i);
          });

          // ── Auto-check via CheckDataSet, then populate ──
          self._executeCheck(aMapped, sCat);

        } catch (ex) {
          BusyIndicator.hide();
          console.error("[S6] Excel parse error", ex);
          MessageBox.error("Errore nella lettura del file Excel:\n" + ex.message);
        }
      };

      oReader.onerror = function () {
        BusyIndicator.hide();
        MessageBox.error("Errore nella lettura del file");
      };

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
            MessageToast.show(iTotal + " righe verificate: tutte OK");
          } else {
            // Build per-row error detail like Screen3/4
            var aErrDetails = [];
            aRows.forEach(function (r, idx) {
              if (r.__checkHasError) {
                aErrDetails.push("Riga " + (idx + 1) + ": " + (r.__checkMessage || "Errore"));
              }
            });
            var sMsg = "Verifica completata: " + iErrors + " righe con errori su " + iTotal + " totali.\n\n";
            sMsg += aErrDetails.slice(0, 15).join("\n");
            if (aErrDetails.length > 15) {
              sMsg += "\n\n... e altre " + (aErrDetails.length - 15) + " righe con errori.";
            }
            sMsg += "\n\nCorreggere gli errori e ricaricare il file, oppure procedere con le sole righe valide.";
            MessageBox.warning(sMsg);
          }
        },
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
      var aRespLines = [];

      if (oData && oData.PostDataCollection && oData.PostDataCollection.results) {
        aRespLines = oData.PostDataCollection.results;
      } else if (oData && oData.PostDataCollection && Array.isArray(oData.PostDataCollection)) {
        aRespLines = oData.PostDataCollection;
      }

      var iErrors = 0;

      aRows.forEach(function (row, idx) {
        var oResp = aRespLines[idx] || {};
        var sEsito = String(oResp.Esito || oResp.esito || oResp.ESITO || "").trim().toUpperCase();
        var sMessage = String(oResp.Message || oResp.message || oResp.MESSAGE || oResp.Messaggio || "").trim();

        if (sEsito === "E" || sEsito === "ERROR" || sEsito === "KO") {
          row.__checkEsito = "Errore";
          row.__checkMessage = sMessage || "Errore";
          row.__checkHasError = true;
          iErrors++;
        } else if (sEsito === "W" || sEsito === "WARNING") {
          row.__checkEsito = "Attenzione";
          row.__checkMessage = sMessage || "Attenzione";
          row.__checkHasError = false;
        } else if (sEsito === "S" || sEsito === "OK" || sEsito === "SUCCESS" || sEsito === "") {
          row.__checkEsito = "OK";
          row.__checkMessage = sMessage || "OK";
          row.__checkHasError = false;
        } else {
          // Unknown esito: treat as error to be safe
          row.__checkEsito = sEsito || "Errore";
          row.__checkMessage = sMessage || "Esito sconosciuto: " + sEsito;
          row.__checkHasError = true;
          iErrors++;
        }
      });

      oDetail.setProperty("/checkErrorCount", iErrors);
      oDetail.setProperty("/checkPassed", iErrors === 0);
      oDetail.setProperty("/checkDone", true);
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

      // Build column config from raw MMCT fields (same logic as Screen5)
      var seen = Object.create(null);
      var aCfgAll = [];

      aRawFields.forEach(function (f) {
        var ui = String(f.UiFieldname || f.UIFIELDNAME || "").trim();
        if (!ui) return;
        var k = ui.toUpperCase();
        if (seen[k]) return;
        seen[k] = true;
        var imp = String(f.Impostazione || "").trim().toUpperCase();
        if (imp === "N") return; // hidden
        aCfgAll.push({
          ui: ui,
          label: String(f.UiFieldLabel || f.Descrizione || ui).trim(),
          domain: String(f.Dominio || "").trim(),
          required: imp === "O",
          locked: imp === "B",
          attachment: imp === "A",
          download: imp === "D",
          multiple: String(f.MultipleVal || "").trim().toUpperCase() === "X",
          order: parseInt(String(f.Ordinamento || "9999").trim(), 10) || 9999,
          numeric: (function () {
            var sUi = String(f.UiFieldname || f.UIFIELDNAME || "").trim();
            var aNum = ["Perccomp", "PerccompFibra", "PercMatRicicl", "PesoPack",
                        "QtaFibra", "FattEmissione", "CalcCarbonFoot", "GradoRic"];
            return aNum.indexOf(sUi) >= 0;
          })()
        });
      });

      // Sort by Ordinamento
      aCfgAll.sort(function (a, b) { return (a.order || 9999) - (b.order || 9999); });

      // Set rows
      oDetail.setProperty("/RowsAll", aRows);
      oDetail.setProperty("/Rows", aRows);
      oDetail.setProperty("/RowsCount", aRows.length);

      // Set MDC config
      var aProps = aCfgAll.map(function (f) {
        var name = String(f.ui || "").trim();
        if (name.toUpperCase() === "STATO") name = "Stato";
        return { name: name, label: f.label || name, dataType: "String", domain: f.domain || "", required: !!f.required };
      });
      oVm.setProperty("/mdcCfg/screen6", { modelName: "detail", collectionPath: "/Rows", properties: aProps });

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
      MessageToast.show("Dati caricati rimossi");
    },

    // ==================== EXPORT PREVIEW ====================
    onExportExcel: async function () {
      try {
        BusyIndicator.show(0);
        var oDetail = this.getView().getModel("detail");
        var aRows = oDetail.getProperty("/Rows") || [];
        if (!aRows.length) { MessageToast.show("Nessun dato da esportare"); return; }

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
        MessageToast.show("Excel esportato");
      } catch (e) {
        console.error("[S6] Export error", e);
        MessageToast.show("Errore export");
      } finally {
        BusyIndicator.hide();
      }
    },

    // ==================== SEND DATA (POST) ====================
    onSendData: function () {
      var oDetail = this.getView().getModel("detail");
      var aRows = oDetail.getProperty("/RowsAll") || [];
      if (!aRows.length) {
        MessageToast.show("Nessun dato da inviare");
        return;
      }

      var sCat = this._getSelectedCat();
      if (!sCat) {
        MessageToast.show("Seleziona una categoria materiale");
        return;
      }

      if (!this._validateRequiredFieldsForRows(aRows, sCat)) return;

      var aRowsToSend = this._filterOutCheckErrorRows(aRows, oDetail);
      if (!aRowsToSend) return;

      var self = this;
      var iCheckErrors = oDetail.getProperty("/checkErrorCount") || 0;
      var sConfirmMsg = "Stai per inviare " + aRowsToSend.length + " righe al sistema.";
      if (iCheckErrors > 0) {
        sConfirmMsg += "\n(" + iCheckErrors + " righe con errori saranno escluse)";
      }
      sConfirmMsg += "\nProseguire?";

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
      var aRequired = S6Excel.collectRequiredFields(aRawFields);
      if (!aRequired.length) return true;

      var aErrors = S6Excel.findMissingRequiredPerRow(aRows, aRequired);
      if (!aErrors.length) return true;

      var sMsg = "Campi obbligatori mancanti:\n\n";
      sMsg += aErrors.slice(0, 10).join("\n");
      if (aErrors.length > 10) {
        sMsg += "\n\n... e altre " + (aErrors.length - 10) + " righe con errori.";
      }
      sMsg += "\n\nTotale righe con errori: " + aErrors.length + " su " + aRows.length;
      MessageBox.warning(sMsg);
      return false;
    },

    _filterOutCheckErrorRows: function (aRows, oDetail) {
      var iCheckErrors = oDetail.getProperty("/checkErrorCount") || 0;
      if (iCheckErrors <= 0) return aRows;

      var aFiltered = aRows.filter(function (r) { return !r.__checkHasError; });
      if (!aFiltered.length) {
        MessageBox.error("Tutte le righe hanno errori di verifica. Correggere e ricaricare il file.");
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
          MessageBox.success("Dati inviati con successo (" + aLines.length + " righe)");
          self.onClearUpload();
        },
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
