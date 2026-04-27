sap.ui.define([
	"sap/ui/test/Opa5",
	"./arrangements/Startup",
	"./pages/Screen0",
	"./pages/Screen1",
	"./pages/Screen2",
	"./pages/Screen3",
	"./pages/Screen4",
	"./pages/Screen5",
	"./pages/Screen6",
	"./pages/Dialog"
], function (Opa5, Startup) {
	"use strict";

	Opa5.extendConfig({
		arrangements: new Startup(),
		viewNamespace: "apptracciabilita.apptracciabilita.view.",
		autoWait: true
	});

	sap.ui.require([
		"apptracciabilita/apptracciabilita/test/integration/journeys/FlowAJourney",
		"apptracciabilita/apptracciabilita/test/integration/journeys/FlowCJourney",
		"apptracciabilita/apptracciabilita/test/integration/journeys/FlowBJourney",
		"apptracciabilita/apptracciabilita/test/integration/journeys/RoleProfilesJourney"
	], function () {
		window.__integrationJourneysLoaded = true;
		if (typeof window.__integrationJourneysReady === "function") {
			window.__integrationJourneysReady();
		}
	});
});
