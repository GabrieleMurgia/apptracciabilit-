
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
                // call the base component's init function
                UIComponent.prototype.init.apply(this, arguments);
                this.getRouter().initialize();

                this.setModel(models.createDeviceModel(), "device");
            }
        });
    }
);