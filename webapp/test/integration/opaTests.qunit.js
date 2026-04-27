/* global QUnit */

QUnit.config.autostart = false;

function startWhenJourneysReady() {
	if (window.__integrationJourneysLoaded) {
		return QUnit.start();
	}
	window.__integrationJourneysReady = function () {
		QUnit.start();
	};
}

sap.ui.getCore().attachInit(function () {
	sap.ui.require([
		"apptracciabilita/apptracciabilita/test/integration/AllJourneys"
	], function () {
		startWhenJourneysReady();
	});
});
