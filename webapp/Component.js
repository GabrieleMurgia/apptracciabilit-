/**
 * eslint-disable @sap/ui5-jsdocs/no-jsdoc
 */

sap.ui.define([
        "sap/ui/core/UIComponent",
        "sap/ui/Device",
        "apptracciabilita/apptracciabilita/model/models",
        "sap/ui/model/odata/v2/ODataModel",
        "sap/m/MessageToast",
        "apptracciabilita/apptracciabilita/model/mockBackend"
    ],
    function (UIComponent, Device, models, ODataModel, MessageToast, MockBackend) {
        "use strict";

        return UIComponent.extend("apptracciabilita.apptracciabilita.Component", {
            metadata: {
                manifest: "json"
            },

            /**
             * The component is initialized by UI5 automatically during the startup of the app and calls the init method once.
             * @public
             * @override
             */
            init: function () {
                // call the base component's init function
                UIComponent.prototype.init.apply(this, arguments);

                // ✅ init model principale con fallback mock (SAP giù -> mock)
                this._initMainModelWithFallback();

                // enable routing
                this.getRouter().initialize();

                // set the device model
                this.setModel(models.createDeviceModel(), "device");
            },

            _getMainServiceUrl: function () {
                // prova a leggere dal manifest (sap.app > dataSources) il primo datasource OData
                try {
                    var oApp = this.getManifestEntry("sap.app");
                    var ds = oApp && oApp.dataSources;
                    if (ds) {
                        for (var k in ds) {
                            var d = ds[k];
                            if (!d) continue;

                            var t = String(d.type || "").toLowerCase();
                            if (t.indexOf("odata") >= 0 && d.uri) {
                                return d.uri;
                            }
                        }
                    }
                } catch (e) { /* ignore */ }

                // fallback hardcoded
                return "/sap/opu/odata/sap/ZVEND_TRACE_SRV/";
            },

            _initMainModelWithFallback: function () {
                var sUrl = this._getMainServiceUrl();

                // 1) setta SUBITO il mock come default -> l’app non muore mai
                // (userId coerente con il tuo Screen0 che usa E_ZEMAF)
                var oMock = MockBackend.createMockODataModel({ userId: "E_ZEMAF" });
                this.setModel(oMock);

                // opzionale: forza mock da URL: ?mock=1
                var bForceMock = (typeof window !== "undefined") &&
                    /(?:\?|&)mock=1\b/i.test((window.location && window.location.search) || "");
                if (bForceMock) {
                    MessageToast.show("MOCK attivo (forzato da ?mock=1)");
                    return;
                }

                // 2) prova il vero OData (se metadata OK -> switch)
                try {
                    var oReal = new ODataModel(sUrl, {
                        json: true,
                        useBatch: false,
                        defaultBindingMode: "TwoWay"
                    });

                    oReal.metadataLoaded()
                        .then(function () {
                            this.setModel(oReal);
                            MessageToast.show("SAP OK: uso backend reale");
                        }.bind(this))
                        .catch(function () {
                            // resta mock
                            MessageToast.show("SAP KO: uso dati MOCK (metadata 503)");
                        });
                } catch (e) {
                    MessageToast.show("SAP KO: uso dati MOCK (" + (e && e.message ? e.message : "errore") + ")");
                }
            }
        });
    }
);
