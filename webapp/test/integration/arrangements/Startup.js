sap.ui.define([
	"sap/ui/test/Opa5",
	"./IntegrationBackend"
], function (Opa5, IntegrationBackend) {
	"use strict";

	return Opa5.extend("integration.arrangements.Startup", {

		iStartMyApp: function (oOptionsParameter) {
			var oOptions = oOptionsParameter || {};
			IntegrationBackend.install({ profile: oOptions.profile });

			// start the app with a minimal delay to make tests fast but still async to discover basic timing issues
			oOptions.delay = oOptions.delay || 50;

			// start the app UI component
			this.iStartMyUIComponent({
				componentConfig: {
					name: "apptracciabilita.apptracciabilita",
					async: true
				},
				hash: oOptions.hash,
				autoWait: oOptions.autoWait
			});
		},

		iTeardownMyApp: function () {
			IntegrationBackend.uninstall();
			return this.iTeardownMyUIComponent();
		}
	});
});
