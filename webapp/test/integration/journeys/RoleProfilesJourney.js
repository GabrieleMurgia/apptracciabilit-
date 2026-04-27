sap.ui.define([
  "sap/ui/test/opaQunit"
], function (opaTest) {
  "use strict";

  QUnit.module("Role profiles");

  opaTest("Supplier E real-derived profile hides aggregated tile and enters Screen3 in NoMatList mode", function (Given, When, Then) {
    Given.iStartMyApp({ hash: "", profile: "supplier-real-e" });
    Then.onTheScreen0Page.iShouldSeeLandingPage();
    Then.onTheScreen0Page.iShouldExposeUserType("E");
    Then.onTheScreen0Page.iShouldExposeAggregatedTileState(false);

    When.onTheScreen0Page.iPressFlowATile();
    Then.onTheScreen2Page.iShouldSeeMaterialsLoaded();
    Then.onTheScreen2Page.iShouldSeeRealSupplierNoMatListSeed();

    When.onTheScreen2Page.iPressFirstMaterial();
    Then.onTheScreen3Page.iShouldSeeRecordsLoaded();
    Then.onTheScreen3Page.iShouldBeInNoMatListMode();
    Then.onTheScreen3Page.iShouldSeeNoMatListCrudGuard();
    Then.onTheScreen3Page.iShouldSeeApprovalActionsHidden();
    Then.iTeardownMyApp();
  });

  opaTest("Valentino I synthetic profile shows aggregated tile and approval actions on Screen3", function (Given, When, Then) {
    Given.iStartMyApp({ hash: "", profile: "valentino-synthetic-i" });
    Then.onTheScreen0Page.iShouldSeeLandingPage();
    Then.onTheScreen0Page.iShouldExposeUserType("I");
    Then.onTheScreen0Page.iShouldExposeAggregatedTileState(true);

    When.onTheScreen0Page.iPressFlowATile();
    Then.onTheScreen1Page.iShouldSeeVendorsLoaded();

    When.onTheScreen1Page.iPressFirstVendor();
    Then.onTheScreen2Page.iShouldSeeMaterialsLoaded();

    When.onTheScreen2Page.iPressFirstMaterial();
    Then.onTheScreen3Page.iShouldSeeRecordsLoaded();
    Then.onTheScreen3Page.iShouldSeeApprovalActionsVisible();
    Then.iTeardownMyApp();
  });

  opaTest("Superuser S synthetic profile can access Flow C and load saved rows", function (Given, When, Then) {
    Given.iStartMyApp({ hash: "", profile: "superuser-synthetic-s" });
    Then.onTheScreen0Page.iShouldSeeLandingPage();
    Then.onTheScreen0Page.iShouldExposeUserType("S");
    Then.onTheScreen0Page.iShouldExposeAggregatedTileState(true);

    When.onTheScreen0Page.iPressFlowCTile();
    When.onTheScreen5Page.iSelectCategory("CF");
    When.onTheScreen5Page.iPressLoadData();
    Then.onTheScreen5Page.iShouldSeeLoadedRows();
    Then.iTeardownMyApp();
  });

  opaTest("Superuser S synthetic profile exposes add/copy/delete on Screen3", function (Given, When, Then) {
    Given.iStartMyApp({ hash: "", profile: "superuser-synthetic-s" });
    Then.onTheScreen0Page.iShouldSeeLandingPage();

    When.onTheScreen0Page.iPressFlowATile();
    Then.onTheScreen1Page.iShouldSeeVendorsLoaded();

    When.onTheScreen1Page.iPressFirstVendor();
    Then.onTheScreen2Page.iShouldSeeMaterialsLoaded();

    When.onTheScreen2Page.iPressFirstMaterial();
    Then.onTheScreen3Page.iShouldSeeRecordsLoaded();
    Then.onTheScreen3Page.iShouldSeeSuperuserCrudActionsEnabled();
    Then.iTeardownMyApp();
  });
});
