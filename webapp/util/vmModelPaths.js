sap.ui.define([], function () {
  "use strict";

  var CACHE_ROOT = "/cache";
  var DATA_ROWS_BY_KEY_ROOT = CACHE_ROOT + "/dataRowsByKey/";
  var RECORDS_BY_KEY_ROOT = CACHE_ROOT + "/recordsByKey/";
  var DELETED_LINES_FOR_POST_ROOT = CACHE_ROOT + "/__deletedLinesForPost_";

  return {
    CACHE_ROOT: CACHE_ROOT,
    DATA_ROWS_BY_KEY_ROOT: DATA_ROWS_BY_KEY_ROOT,
    RECORDS_BY_KEY_ROOT: RECORDS_BY_KEY_ROOT,
    DELETED_LINES_FOR_POST_ROOT: DELETED_LINES_FOR_POST_ROOT,

    SCREEN4_DETAILS_BY_KEY: CACHE_ROOT + "/screen4DetailsByKey",
    SCREEN4_PARENT_GUID_BY_IDX: CACHE_ROOT + "/screen4ParentGuidByIdx",
    SELECTED_SCREEN3_RECORD: "/selectedScreen3Record",
    SKIP_S3_BACKEND_ONCE: "/__skipS3BackendOnce",
    FORCE_S3_CACHE_RELOAD: "/__forceS3CacheReload",
    NO_MAT_LIST_MODE: "/__noMatListMode",
    NO_MAT_LIST_CAT: "/__noMatListCat",
    CURRENT_SEASON: "/__currentSeason",

    dataRowsByKeyPath: function (sCacheKey) {
      return DATA_ROWS_BY_KEY_ROOT + sCacheKey;
    },

    recordsByKeyPath: function (sCacheKey) {
      return RECORDS_BY_KEY_ROOT + sCacheKey;
    },

    deletedLinesForPostPath: function (sCacheKey) {
      return DELETED_LINES_FOR_POST_ROOT + sCacheKey;
    }
  };
});
