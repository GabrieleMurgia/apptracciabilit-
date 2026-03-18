sap.ui.define([
        "sap/ui/core/UIComponent",
        "sap/ui/Device",
        "apptracciabilita/apptracciabilita/model/models"
    ],
    function (UIComponent, Device, models) {
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
                var fnSetYear = function () {
                    var oVm = self.getModel("vm");
                    if (oVm) {
                        oVm.setProperty("/legalYear", sYear);
                    }
                };
                fnSetYear();
                this.getRouter().attachRouteMatched(fnSetYear);

                // ── Dynamic logo from OData ──
                var sLogoUrl = "/sap/opu/odata/sap/ZVEND_TRACE_SRV/GetFieldFileSet(FieldName='Loghi',FieldValue='VALENTINO')/$value";
                var fnSetLogo = function () {
                    var oVm = self.getModel("vm");
                    if (oVm) {
                        oVm.setProperty("/logoSrc", sLogoUrl);
                    }
                };
                fnSetLogo();
                this.getRouter().attachEventOnce("routeMatched", fnSetLogo);
            }
        });
    }
);