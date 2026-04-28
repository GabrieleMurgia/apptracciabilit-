sap.ui.define([
        "sap/ui/core/UIComponent",
        "sap/ui/core/Core",
        "sap/ui/Device",
        "apptracciabilita/apptracciabilita/model/models",
        "apptracciabilita/apptracciabilita/util/vmCache"
    ],
    function (UIComponent, Core, Device, models, VmCache) {
        "use strict";

        return UIComponent.extend("apptracciabilita.apptracciabilita.Component", {
            metadata: {
                manifest: "json"
            },

            /**
             * @public
             * @override
             */
            
            init: function () {
                UIComponent.prototype.init.apply(this, arguments);

                if (this.getModel("i18n")) {
                    Core.setModel(this.getModel("i18n"), "i18n");
                }

                // Test-only hook: integration OPA can inject a stateful fake OData model
                // without changing the normal runtime path.
                var oIntegrationBackend = (typeof window !== "undefined" && window.__vendTraceIntegrationBackend) || null;
                if (oIntegrationBackend && typeof oIntegrationBackend.createModel === "function") {
                    this.setModel(oIntegrationBackend.createModel({
                        component: this
                    }));
                }

                // ── Dynamic year for legal footer ──
                var sYear = String(new Date().getFullYear());

                // Screen3/4/5/6: CSS ::before
                var oStyle = document.createElement("style");
                oStyle.textContent =
                  '.pageWithLegalBar .sapMPageFooter::before { content: "VALENTINO.COM\\APowered by Valentino Copyright © ' +
                  sYear +
                  ' VALENTINO S.p.A. - All rights reserved - VAT 05412951005 Informazioni sul venditore"; }';
                document.head.appendChild(oStyle);

                this.getRouter().initialize();
                this.setModel(models.createDeviceModel(), "device");

                // Screen0/1/2: set year on vm model for XML binding
                var self = this;
                var fnGetVm = function () {
                    var oVm = VmCache.ensureVmCache(self);
                    if (!oVm.getProperty("/mdcCfg")) {
                        oVm.setProperty("/mdcCfg", {});
                    }
                    return oVm;
                };
                var fnSetYear = function () {
                    fnGetVm().setProperty("/legalYear", sYear);
                };
                fnSetYear();
                this.getRouter().attachRouteMatched(fnSetYear);

                // ── Dynamic logo from OData ──
                /* var sLogoUrl = "/sap/opu/odata/sap/ZVEND_TRACE_SRV/GetFieldFileSet(FieldName='Loghi',FieldValue='VALENTINO')/$value"; */

                var oModel = this.getModel();
                var sServiceUrl = (oModel && oModel.sServiceUrl) || "/sap/opu/odata/sap/ZVEND_TRACE_SRV";
                var sLogoUrl =
                    (oIntegrationBackend && typeof oIntegrationBackend.getLogoSrc === "function" && oIntegrationBackend.getLogoSrc()) ||
                    (sServiceUrl + "/GetFieldFileSet(FieldName='Loghi',FieldValue='VALENTINO')/$value");


                var fnSetLogo = function () {
                    fnGetVm().setProperty("/logoSrc", sLogoUrl);
                };
                fnSetLogo();
                this.getRouter().attachRouteMatched(fnSetLogo);
            }
        });
    }
);
